#!/usr/bin/env node
/**
 * Re-runnable migration runner.
 *
 * - Reads db/migrations/*.sql in filename order.
 * - Runs each file inside its own transaction: a half-applied migration is impossible.
 * - Records what it applied in `_migrations`, so running it twice is a no-op.
 * - Stores a sha256 of each file and refuses to continue if an already-applied
 *   migration has been edited on disk, because the database no longer matches the repo.
 *
 * Deliberately standalone: it reads DATABASE_URL itself rather than importing
 * server/src/config/env.js, so a fresh clone or CI job can migrate without a
 * JWT_SECRET or any other app config being present.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const MIGRATIONS_DIR = path.join(HERE, 'migrations');

// Node's built-in .env reader (>=20.12). Keeps `dotenv` off the dependency list (CLAUDE.md §1.7).
try {
  process.loadEnvFile(path.join(REPO_ROOT, '.env'));
} catch {
  // No .env file: fall back to whatever is already in the real environment.
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and try again.');
  process.exit(1);
}

// One shared lock id for every runner instance. Session-scoped, so it must be
// taken and released on the same connection - hence a single Client, not a Pool.
const ADVISORY_LOCK_ID = 4915623;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function connectWithRetry(client, attempts = 15, delayMs = 1000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await client.connect();
      return;
    } catch (err) {
      const isLast = attempt === attempts;
      if (isLast) throw err;
      if (attempt === 1) process.stdout.write('waiting for postgres');
      process.stdout.write('.');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await connectWithRetry(client);
  process.stdout.write('\n');

  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename    TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: appliedRows } = await client.query(
      'SELECT filename, checksum FROM _migrations'
    );
    const applied = new Map(appliedRows.map((r) => [r.filename, r.checksum]));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.error(`No .sql files found in ${MIGRATIONS_DIR}`);
      process.exitCode = 1;
      return;
    }

    let ran = 0;
    for (const filename of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
      const checksum = sha256(sql);
      const previousChecksum = applied.get(filename);

      if (previousChecksum) {
        if (previousChecksum !== checksum) {
          throw new Error(
            `${filename} has changed since it was applied.\n` +
              '  Migrations are immutable once applied. Either revert the file, or\n' +
              '  rebuild the database from scratch with:  npm run db:reset && npm run migrate'
          );
        }
        console.log(`  skip  ${filename}`);
        continue;
      }

      const startedAt = Date.now();
      // Each file is all-or-nothing.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename, checksum, duration_ms) VALUES ($1, $2, $3)',
          [filename, checksum, Date.now() - startedAt]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${filename} failed and was rolled back: ${err.message}`, { cause: err });
      }
      console.log(`  apply ${filename}  (${Date.now() - startedAt}ms)`);
      ran += 1;
    }

    console.log(
      ran === 0
        ? `\nDatabase already up to date (${files.length} migrations).`
        : `\nApplied ${ran} migration${ran === 1 ? '' : 's'}. ${files.length} total.`
    );
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\nMigration failed: ${err.message}`);
  process.exit(1);
});
