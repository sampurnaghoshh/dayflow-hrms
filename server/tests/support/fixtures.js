/**
 * Test fixtures. Not a test file - it lives under tests/support/ so the node:test
 * runner's file matching does not pick it up.
 *
 * Tests run against the real database (CLAUDE.md §12). They append rather than clean
 * up after themselves, because the ledger is append-only and the concurrency test needs
 * genuinely committed transactions rather than a rollback at the end. To reset:
 *
 *   npm run db:reset && npm run migrate && npm run seed
 */
import { randomBytes } from 'node:crypto';
import { pool } from '../../src/db/pool.js';

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}${randomBytes(2).toString('hex')}`;

/**
 * Creates a user + employee, and optionally opening ledger balances.
 *
 * @param {object} [opts]
 * @param {'EMPLOYEE'|'HR'|'ADMIN'} [opts.role]
 * @param {Record<string,string>} [opts.opening]  leave type code -> opening delta
 * @returns {Promise<{userId: string, employeeId: string, role: string, fullName: string, actor: object}>}
 */
export async function createEmployee({ role = 'EMPLOYEE', opening = {}, fullName } = {}) {
  const suffix = unique();
  const name = fullName ?? `Test ${suffix}`;

  const { rows: userRows } = await pool.query(
    `INSERT INTO users (employee_code, email, password_hash, role, status, email_verified_at)
     VALUES ($1, $2, 'x', $3::user_role, 'ACTIVE', now())
     RETURNING id`,
    [`T-${suffix}`.slice(0, 12), `${suffix}@test.local`, role]
  );
  const userId = userRows[0].id;

  const { rows: empRows } = await pool.query(
    `INSERT INTO employees (user_id, full_name, date_of_joining)
     VALUES ($1, $2, CURRENT_DATE) RETURNING id`,
    [userId, name]
  );
  const employeeId = empRows[0].id;

  for (const [code, delta] of Object.entries(opening)) {
    await pool.query(
      `INSERT INTO leave_balance_ledger (employee_id, leave_type_id, delta, reason, note)
       SELECT $1, lt.id, $2::numeric, 'OPENING', 'test fixture'
       FROM leave_types lt WHERE lt.code = $3`,
      [employeeId, delta, code]
    );
  }

  return {
    userId,
    employeeId,
    role,
    fullName: name,
    // The shape requireAuth puts on req.user.
    actor: { id: userId, role, employeeId },
  };
}

export async function leaveTypeId(code) {
  const { rows } = await pool.query('SELECT id FROM leave_types WHERE code = $1', [code]);
  if (!rows[0]) {
    throw new Error(`Leave type ${code} is missing. Run: npm run seed`);
  }
  return Number(rows[0].id);
}

export async function balanceOf(employeeId, code) {
  const { rows } = await pool.query(
    `SELECT ROUND(v.balance, 2)::text AS balance
     FROM v_leave_balances v WHERE v.employee_id = $1 AND v.leave_code = $2`,
    [employeeId, code]
  );
  return rows[0]?.balance ?? null;
}

export async function ledgerRowsFor(requestId) {
  const { rows } = await pool.query(
    `SELECT reason, ROUND(delta, 2)::text AS delta
     FROM leave_balance_ledger WHERE ref_request_id = $1 ORDER BY id`,
    [requestId]
  );
  return rows;
}

export async function sumOfDeltas(employeeId, code) {
  const { rows } = await pool.query(
    `SELECT ROUND(COALESCE(SUM(l.delta), 0), 2)::text AS total
     FROM leave_balance_ledger l
     JOIN leave_types lt ON lt.id = l.leave_type_id
     WHERE l.employee_id = $1 AND lt.code = $2`,
    [employeeId, code]
  );
  return rows[0].total;
}

export async function stepsFor(requestId) {
  const { rows } = await pool.query(
    `SELECT id, step_no, approver_role, status FROM approval_steps
     WHERE request_id = $1 ORDER BY step_no`,
    [requestId]
  );
  return rows;
}

export async function requestStatus(requestId) {
  const { rows } = await pool.query(
    'SELECT status, current_step FROM leave_requests WHERE id = $1',
    [requestId]
  );
  return rows[0];
}

/**
 * A Monday roughly `weeksAhead` weeks from today, chosen so that Monday..Friday of that
 * week falls entirely inside one calendar year - leave may not span years (§5.1), and
 * a range in the past is rejected. Computed rather than hardcoded so the suite does not
 * quietly start failing once the calendar moves past a literal date.
 */
export function mondayWeeksAhead(weeksAhead = 2) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  // Advance to the next Monday, then on by whole weeks.
  const daysToMonday = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysToMonday + (weeksAhead - 1) * 7);

  // Keep Mon..Fri inside a single year.
  for (let guard = 0; guard < 60; guard += 1) {
    const friday = new Date(d.getTime() + 4 * 86_400_000);
    if (friday.getUTCFullYear() === d.getUTCFullYear()) break;
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return d.toISOString().slice(0, 10);
}

export function addDays(dateString, n) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const closeDb = () => pool.end();
