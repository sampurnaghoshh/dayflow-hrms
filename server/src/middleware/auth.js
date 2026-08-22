/**
 * Authentication and role gates.
 *
 * The JWT lives in an httpOnly, SameSite=Lax cookie and never in localStorage,
 * so a successful XSS cannot read it (CLAUDE.md §8).
 *
 * Signing lives here alongside verification on purpose: one file owns the cookie
 * name, the algorithm, the lifetime and the secret, so the two halves cannot drift
 * apart. The auth service imports signAuthToken rather than re-deriving any of it.
 *
 * `cookie-parser` is not on the §7 dependency allowlist, so reading the header is
 * done here in a few lines instead of pulling in a package. Setting cookies needs
 * no dependency at all - res.cookie() is built into Express.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export const AUTH_COOKIE = 'dayflow_session';

const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours (§8)
const ALGORITHM = 'HS256';

/** Options for res.cookie(). clearAuthCookie must match these or the browser keeps the cookie. */
export const authCookieOptions = Object.freeze({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction, // no HTTPS on localhost, so only enforce in production
  path: '/',
  maxAge: TOKEN_TTL_SECONDS * 1000,
});

/** @param {{userId: string|number, role: string, employeeId: string|number|null}} claims */
export function signAuthToken({ userId, role, employeeId }) {
  return jwt.sign(
    { role, employeeId: employeeId ?? null },
    env.JWT_SECRET,
    { algorithm: ALGORITHM, expiresIn: TOKEN_TTL_SECONDS, subject: String(userId) }
  );
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, authCookieOptions);
}

export function clearAuthCookie(res) {
  const { maxAge, ...rest } = authCookieOptions;
  res.clearCookie(AUTH_COOKIE, rest);
}

/** "a=1; b=2" -> { a: '1', b: '2' }. Splits on the first '=' only. */
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!name || name in out) continue; // first occurrence wins
    try {
      out[name] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      out[name] = part.slice(eq + 1).trim(); // malformed percent-encoding
    }
  }
  return out;
}

/**
 * Verifies the session cookie and attaches req.user.
 *
 * Deliberately stateless: no database round trip per request. The trade-off is
 * that a role change or a DISABLED account only takes effect on the user's next
 * login, within the 8h token lifetime. Routes that must not serve a disabled
 * user re-check status against the database themselves.
 */
export function requireAuth(req, res, next) {
  const token = parseCookies(req.headers.cookie)[AUTH_COOKIE];
  if (!token) return next(unauthorized('NOT_AUTHENTICATED', 'You need to sign in to do that.'));

  try {
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
    req.user = {
      id: claims.sub,
      role: claims.role,
      employeeId: claims.employeeId ?? null,
    };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(unauthorized('SESSION_EXPIRED', 'Your session has expired. Please sign in again.'));
    }
    return next(unauthorized('INVALID_SESSION', 'Your session is not valid. Please sign in again.'));
  }
}

/**
 * requireRole('HR', 'ADMIN') - server-side gate on every privileged route.
 * Hiding a button in the UI is not access control (§8).
 *
 * There is no implicit hierarchy: ADMIN does not silently satisfy requireRole('HR').
 * Every route names the roles it accepts, so the policy is readable at the call site.
 */
export function requireRole(...roles) {
  if (roles.length === 0) throw new Error('requireRole() needs at least one role');
  const allowed = new Set(roles);

  return function checkRole(req, res, next) {
    if (!req.user) {
      // requireAuth was not mounted ahead of this. Fail closed.
      return next(unauthorized('NOT_AUTHENTICATED', 'You need to sign in to do that.'));
    }
    if (!allowed.has(req.user.role)) {
      return next(forbidden('INSUFFICIENT_ROLE', 'You do not have permission to do that.'));
    }
    return next();
  };
}
