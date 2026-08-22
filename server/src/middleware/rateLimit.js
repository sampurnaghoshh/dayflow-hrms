/**
 * Fixed-window rate limiter backed by an in-memory Map.
 *
 * CLAUDE.md §8 asks for exactly this on /auth/login: 5 attempts per 15 minutes per
 * email, and says an in-memory Map is fine. That is a deliberate scope choice - a
 * shared store would mean Redis, which is an anti-goal (§13). The trade-off is that
 * the counters reset when the process restarts and are not shared across instances.
 *
 * Returns 429, which is not in the §6 status list. There is no listed code that
 * honestly describes "too many attempts": 401 would tell an attacker their guess was
 * merely wrong, and 403 would imply a permission problem. The error envelope is
 * unchanged, so the client still parses one shape.
 */
import { AppError } from '../lib/errors.js';

/**
 * @param {object}   opts
 * @param {number}   opts.windowMs   width of the window
 * @param {number}   opts.max        attempts allowed per key per window
 * @param {(req: object) => string|null} opts.keyFrom  null skips this request entirely
 * @param {string}   [opts.code]     error code to throw
 * @param {string}   [opts.message]  human-readable message
 */
export function rateLimit({ windowMs, max, keyFrom, code = 'TOO_MANY_ATTEMPTS', message }) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const hits = new Map();

  // Periodic sweep so keys that are never retried cannot accumulate forever.
  // unref() keeps this timer from holding the process (or a test run) open.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, Math.min(windowMs, 5 * 60_000));
  sweep.unref?.();

  function middleware(req, res, next) {
    const key = keyFrom(req);
    // No key means there is nothing to attribute the attempt to - e.g. the body
    // failed validation, so this was never a credential guess.
    if (!key) return next();

    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    if (entry.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      const minutes = Math.ceil(retryAfter / 60);
      return next(
        new AppError(
          429,
          code,
          message ?? `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
        )
      );
    }

    entry.count += 1;
    return next();
  }

  /** Called after a success, so a legitimate user is not locked out by earlier typos. */
  middleware.clear = (key) => {
    if (key) hits.delete(key);
  };

  /** Test seam. */
  middleware.reset = () => hits.clear();

  return middleware;
}
