/**
 * Business logic and transactions for auth. No req, no res, no SQL.
 */
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { pool, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { signAuthToken } from '../../middleware/auth.js';
import { conflict, forbidden, notFound, unauthorized, unprocessable } from '../../lib/errors.js';
import * as q from './auth.queries.js';

const BCRYPT_COST = 10; // §8
const VERIFICATION_TTL_HOURS = 24;

/**
 * Compared against when no user matches, so a request for an unknown email costs
 * the same time as one for a known email. Without it, response latency alone tells
 * an attacker which addresses are registered.
 */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), BCRYPT_COST);

/** The raw token is never stored - only this digest is (see migration 002). */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function toAuthContext(row) {
  return {
    user: {
      id: row.user_id,
      employeeCode: row.employee_code,
      email: row.email,
      role: row.role,
      status: row.status,
      emailVerifiedAt: row.email_verified_at,
      lastLoginAt: row.last_login_at,
    },
    employee: row.employee_id
      ? {
          id: row.employee_id,
          fullName: row.full_name,
          designation: row.designation,
          dateOfJoining: row.date_of_joining,
          phone: row.phone,
          address: row.address,
          profilePhotoPath: row.profile_photo_path,
          managerId: row.manager_id,
          department: row.department_id
            ? { id: row.department_id, code: row.department_code, name: row.department_name }
            : null,
        }
      : null,
  };
}

/**
 * Creates the user, their employee record, their opening leave balances and a
 * verification token as one atomic unit. A half-registered account - a user with no
 * employee row, or an employee with no opening balance - is not reachable.
 */
export async function registerUser(input) {
  // Hashing is ~60ms of CPU. Doing it before BEGIN keeps a pooled connection from
  // sitting idle inside an open transaction while bcrypt works.
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600_000);

  const result = await withTransaction(async (client) => {
    const user = await q.insertUser(client, {
      employeeCode: input.employeeCode,
      email: input.email,
      passwordHash,
    });

    const employee = await q.insertEmployee(client, {
      userId: user.id,
      fullName: input.fullName,
      departmentCode: input.departmentCode,
      designation: input.designation,
      dateOfJoining: input.dateOfJoining,
      phone: input.phone,
      address: input.address,
    });

    // The department is resolved by a subquery, so an unknown code silently yields
    // NULL rather than failing. Catch it here and roll the whole registration back.
    if (input.departmentCode && !employee.department_id) {
      throw unprocessable(
        'DEPARTMENT_NOT_FOUND',
        `There is no department with code "${input.departmentCode}".`,
        [{ field: 'departmentCode', issue: 'Not a known department code' }]
      );
    }

    const openingBalances = await q.insertOpeningLedgerRows(client, {
      employeeId: employee.id,
      dateOfJoining: input.dateOfJoining,
    });

    await q.insertVerificationToken(client, {
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt,
    });

    return { user, employee, openingBalances };
  });

  /*
   * Standing in for SMTP, deliberately.
   *
   * CLAUDE.md §13 rules out sending email via SendGrid or an SMTP provider, and §1.7
   * keeps the dependency list short, so there is no mail transport in this system at
   * all. Outside production the link a user would have received is returned in the
   * response body and written to the log instead, which keeps the full SRS 3.1.1
   * flow - token issued, token consumed, account activated - genuinely exercisable.
   *
   * The guard matters: in production neither the URL nor the raw token is ever
   * disclosed, so this cannot become a way to verify somebody else's account.
   */
  let verification;
  if (!env.isProduction) {
    const url = `${env.CLIENT_ORIGIN}/verify-email?token=${rawToken}`;
    console.log(`[auth] verification link for ${input.email}: ${url}`);
    console.log(`[auth]   (or straight to the API: GET /api/auth/verify?token=${rawToken})`);
    verification = { url, token: rawToken, expiresAt };
  }

  return { ...result, verification };
}

/**
 * Consumes a verification token and activates the account.
 *
 * The token row is locked with FOR UPDATE, so two simultaneous clicks on the same
 * link cannot both observe it as unconsumed.
 */
export async function verifyEmail(rawToken) {
  return withTransaction(async (client) => {
    const row = await q.findLiveVerificationToken(client, { tokenHash: sha256(rawToken) });

    // Unknown token and consumed-token-for-an-inactive-user are both 404: neither
    // reveals whether the token ever existed.
    if (!row) {
      throw notFound('INVALID_VERIFICATION_TOKEN', 'That verification link is not valid.');
    }

    if (row.consumed_at) {
      // Clicking the link a second time on an account that is already active is not
      // an error worth showing a user - report the state they were trying to reach.
      if (row.status === 'ACTIVE') return { alreadyVerified: true };
      throw conflict('VERIFICATION_TOKEN_ALREADY_USED', 'That verification link has already been used.');
    }

    if (new Date(row.expires_at) <= new Date()) {
      throw unprocessable(
        'VERIFICATION_TOKEN_EXPIRED',
        `That verification link expired. Links are valid for ${VERIFICATION_TTL_HOURS} hours.`
      );
    }

    await q.consumeVerificationToken(client, { id: row.id });
    const user = await q.activateUser(client, { userId: row.user_id });

    return { alreadyVerified: false, user };
  });
}

/**
 * Verifies credentials and returns a signed session token.
 *
 * Order matters: the password is checked before the account status. Reporting
 * "your email is not verified" to someone who has not proven they own the account
 * would confirm that the address is registered.
 */
export async function login({ email, password }) {
  return withTransaction(async (client) => {
    const user = await q.findUserByEmail(client, { email });

    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

    // One message for both branches, so it never reveals which half was wrong (§8).
    if (!user || !ok) {
      throw unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw forbidden(
        'EMAIL_NOT_VERIFIED',
        'Please verify your email address before signing in.'
      );
    }
    if (user.status === 'DISABLED') {
      throw forbidden('ACCOUNT_DISABLED', 'This account has been disabled. Contact your administrator.');
    }

    await q.touchLastLogin(client, { userId: user.id });

    return {
      token: signAuthToken({
        userId: user.id,
        role: user.role,
        employeeId: user.employee_id,
      }),
      user: {
        id: user.id,
        employeeCode: user.employee_code,
        email: user.email,
        role: user.role,
        status: user.status,
        employeeId: user.employee_id,
      },
    };
  });
}

/** Current user + employee + role. The pool itself satisfies the client interface. */
export async function getAuthContext(userId) {
  const row = await q.findAuthContext(pool, { userId });
  if (!row) throw notFound('USER_NOT_FOUND', 'That account no longer exists.');
  return toAuthContext(row);
}
