#!/usr/bin/env node
/**
 * Runs every db/seed/*.sql in filename order.
 *
 * Unlike migrations, seeds are NOT tracked and NOT skipped: they are reference and
 * demo data that you re-apply whenever you want the database back in a known state.
 * That makes idempotency the seed file's own job - natural keys with ON CONFLICT,
 * or NOT EXISTS guards.
 *
 * Each seed file owns its own transaction (BEGIN ... COMMIT). The runner deliberately
 * does not wrap them: nesting BEGIN inside BEGIN makes postgres warn and turns the
 * file's COMMIT into a commit of the outer transaction.
 *
 * Standalone by design, like run-migrations.js: reads DATABASE_URL itself so a fresh
 * clone can seed without any other app config being present.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SEED_DIR = path.join(HERE, 'seed');

try {
  process.loadEnvFile(path.join(REPO_ROOT, '.env'));
} catch {
  // No .env file: fall back to the real environment.
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and try again.');
  process.exit(1);
}

/**
 * A fresh Client per attempt: pg will not reconnect one whose connect() already
 * failed, so reusing a single instance would turn "postgres is still booting" into
 * a hard failure.
 */
async function connectWithRetry(connectionString, attempts = 20, delayMs = 1000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      if (attempt > 1) process.stdout.write('\n');
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      if (attempt === attempts) throw err;
      if (attempt === 1) process.stdout.write('waiting for postgres');
      process.stdout.write('.');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const files = (await readdir(SEED_DIR)).filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log(`No .sql files in ${SEED_DIR} - nothing to seed.`);
    return;
  }

  const client = await connectWithRetry(DATABASE_URL);

  try {
    for (const filename of files) {
      const sql = await readFile(path.join(SEED_DIR, filename), 'utf8');
      const startedAt = Date.now();
      try {
        await client.query(sql);
      } catch (err) {
        // The file's own transaction has already rolled back; make sure the
        // session is not left inside an aborted one before we bail out.
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`${filename} failed: ${err.message}`, { cause: err });
      }
      console.log(`  seed  ${filename}  (${Date.now() - startedAt}ms)`);
    }
    console.log(`\nSeeded ${files.length} file${files.length === 1 ? '' : 's'}.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
