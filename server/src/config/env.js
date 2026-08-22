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
