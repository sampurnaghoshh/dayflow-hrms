/**
 * The only pg Pool in the process.
 *
 * Note on types: node-postgres returns NUMERIC and BIGINT as JavaScript strings,
 * and we deliberately leave it that way. Leave days and money are NUMERIC precisely
 * so they never touch a float (CLAUDE.md §1.9); parsing them into Number here would
 * undo that. Arithmetic on those columns belongs in SQL.
 */
import pg from 'pg';
import { env } from '../config/env.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// An idle client erroring out (e.g. the database restarted) must not take the process down.
pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

/** Convenience for single-statement reads that need no transaction. */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `fn` inside a transaction on a dedicated client.
 * COMMITs on return, ROLLBACKs on throw, and always releases the client.
 *
 * Every write path in this codebase goes through here - that is what makes
 * "insert the request AND its approval steps AND its notifications, or none of them"
 * a property of the database rather than a hope.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // The original error is the useful one; surface the rollback failure separately.
      console.error('[db] ROLLBACK failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Closes the pool. Used by tests and by graceful shutdown. */
export function closePool() {
  return pool.end();
}
