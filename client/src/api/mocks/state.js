import { ApiError } from '../ApiError.js';
import * as fixtures from '../fixtures.js';

// Deep-clone the fixtures once per tab so handlers can freely mutate "the database"
// without polluting the imported module (which would leak across hot reloads).
export const store = JSON.parse(JSON.stringify({
  departments: fixtures.departments,
  employees: fixtures.employees,
  mockCredentials: fixtures.mockCredentials,
  leaveTypes: fixtures.leaveTypes,
  leaveBalances: fixtures.leaveBalances,
  leaveLedger: fixtures.leaveLedger,
  leaveRequests: fixtures.leaveRequests,
  holidays: fixtures.holidays,
  attendanceDays: fixtures.attendanceDays,
  todayPresence: fixtures.todayPresence,
  salaryVersions: fixtures.salaryVersions,
  payslips: fixtures.payslips,
  notifications: fixtures.notifications,
  employeeDocuments: fixtures.employeeDocuments,
}));

let nextIds = {
  employee: 100, leaveRequest: 200, step: 2000, ledger: 100,
  document: 100, salaryVersion: 100, payslip: 100, notification: 100, verifyToken: 1,
};
export function nextId(kind) {
  return nextIds[kind]++;
}

// --- mock-only session plumbing (not the real JWT/cookie auth) ---------------------
const SESSION_KEY = 'dayflow_mock_session';
const VERIFY_TOKENS = new Map(); // token -> userId, mock stand-in for emailed verification links

export function issueVerifyToken(userId) {
  const token = `verify-${userId}-${nextId('verifyToken')}`;
  VERIFY_TOKENS.set(token, userId);
  // eslint-disable-next-line no-console
  console.info(`[mock] Verification link for user ${userId}: /verify-email?token=${token}`);
  return token;
}
export function consumeVerifyToken(token) {
  const userId = VERIFY_TOKENS.get(token);
  if (userId) VERIFY_TOKENS.delete(token);
  return userId ?? null;
}

export function setSession(userId) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
}
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
export function currentEmployee() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const { userId } = JSON.parse(raw);
  return store.employees.find((e) => e.userId === userId) ?? null;
}
export function requireActor() {
  const actor = currentEmployee();
  if (!actor) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.', [], 401);
  return actor;
}
export function requireRole(actor, roles) {
  if (!roles.includes(actor.role)) {
    throw new ApiError('FORBIDDEN', "You don't have permission to do that.", [], 403);
  }
}
// An employee reaching for another employee's record gets 404, never 403 (no existence leak).
export function requireSelfOrRole(actor, employeeId, roles) {
  if (actor.id === Number(employeeId)) return;
  if (roles.includes(actor.role)) return;
  throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
}

// --- misc helpers shared by handlers -------------------------------------------------
export function delay(ms = 250 + Math.random() * 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function paginate(rows, page = 1, pageSize = 20) {
  const p = Number(page) || 1;
  const size = Number(pageSize) || 20;
  const start = (p - 1) * size;
  return { data: rows.slice(start, start + size), page: p, pageSize: size, total: rows.length };
}

export function businessDaysBetween(startDate, endDate) {
  const holidaySet = new Set(store.holidays.map((h) => h.holidayDate));
  let count = 0;
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cur <= end) {
    const dow = cur.getDay();
    const iso = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function balanceFor(employeeId, leaveTypeId) {
  const row = store.leaveBalances.find((b) => b.employeeId === employeeId && b.leaveTypeId === leaveTypeId);
  return row?.balance ?? 0;
}

// --- wire-shape helpers ----------------------------------------------------------------
// The internal store keeps numbers (so business logic — balance math, day counts — stays
// simple arithmetic). The real API stringifies every BIGINT id and NUMERIC money/day figure
// (docs/api-shapes.md, node-postgres preserves precision this way — CLAUDE.md §1.9/§4).
// Handlers call these when building the object they return, so the mock's wire format is
// byte-identical to the real server; client.js's normalize() converts it straight back.
export function money(n) {
  return Number(n).toFixed(2);
}
export function idStr(n) {
  return n === null || n === undefined ? null : String(n);
}

// path like '/employees/:id' vs actual '/employees/7' -> { id: '7' } | null
export function matchPath(pattern, path) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const pp = patternParts[i];
    if (pp.startsWith(':')) params[pp.slice(1)] = decodeURIComponent(pathParts[i]);
    else if (pp !== pathParts[i]) return null;
  }
  return params;
}
