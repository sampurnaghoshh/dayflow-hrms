/**
 * The single place process.env is read. Validated once, at import time, so a
 * misconfigured deployment fails on startup rather than on the first request.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// server/src/config/env.js -> repo root
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

// Node's built-in .env reader (>=20.12). Keeps `dotenv` off the dependency list (CLAUDE.md §1.7).
try {
  process.loadEnvFile(path.join(REPO_ROOT, '.env'));
} catch {
  // No .env file: fall back to whatever is already in the real environment.
}

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'is required')
    .refine(
      (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
      'must be a postgres:// connection string'
    ),
  // Signs the auth cookie. Short secrets are brute-forceable, so this is a hard floor.
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  UPLOAD_DIR: z.string().min(1).default('./server/uploads'),
  /*
   * The timezone the business day is measured in.
   *
   * Punches are TIMESTAMPTZ (instants); attendance_days.work_date is a DATE (a calendar
   * day). Turning one into the other needs a zone, and it cannot be the server's:
   * postgres runs UTC here while the app host is IST, so a punch at 01:00 local is
   * 19:30 UTC the previous day and would be filed against the wrong business day.
   * Every punch-to-day mapping goes through this value.
   */
  APP_TIMEZONE: z
    .string()
    .min(1)
    .default('Asia/Kolkata')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'must be a valid IANA timezone, e.g. Asia/Kolkata'),

  // The single browser origin allowed to send credentialed requests (§8).
  // Never a wildcard: '*' is illegal with credentials:true and would defeat SameSite.
  CLIENT_ORIGIN: z
    .string()
    .min(1)
    .default('http://localhost:5173')
    .refine((v) => !v.includes('*'), 'must be an exact origin, not a wildcard')
    .refine((v) => !v.endsWith('/'), 'must not have a trailing slash'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'} ${i.message}`);
  throw new Error(
    `Invalid environment configuration:\n${lines.join('\n')}\n\nCopy .env.example to .env and fill it in.`
  );
}

export const env = Object.freeze({
  ...parsed.data,
  // Absolute from here on, so nothing depends on the process working directory.
  UPLOAD_DIR: path.resolve(REPO_ROOT, parsed.data.UPLOAD_DIR),
  REPO_ROOT,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});
