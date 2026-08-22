#!/usr/bin/env node
/**
 * Generates db/seed/02_demo_data.sql.
 *
 *   node scripts/generate-seed.js
 *
 * Deterministic: a fixed PRNG seed means re-running produces a byte-identical file, so
 * the SQL can be committed and reviewed like any other artefact.
 *
 * What this script does NOT do is invent numbers the application is responsible for.
 * Leave balances are emitted as OPENING/ACCRUAL/CONSUMED/REVERSAL ledger rows and are
 * never written to a balance column, because there isn't one (CLAUDE.md §1.1). Payslip
 * money is computed by the same SQL expression payroll.queries.js uses, so a seeded
 * payslip and a generated one agree to the paisa. attendance_days rows are produced by
 * importing the real deriveDay() (§5.3) rather than by a second implementation here, so
 * POST /attendance/recompute reproduces every row exactly.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { deriveDay } from '../server/src/modules/attendance/attendance.service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'db', 'seed', '02_demo_data.sql');

const DEMO_PASSWORD = 'Dayflow@2026';
const TZ_OFFSET = '+05:30'; // Asia/Kolkata, matching APP_TIMEZONE

// The 8 public holidays seeded by 01_reference.sql.
const HOLIDAYS = new Set([
  '2026-01-26', // Republic Day - Monday, the weekday-holiday demo
  '2026-03-04',
  '2026-04-03',
  '2026-08-15',
  '2026-10-02',
  '2026-10-20',
  '2026-11-08',
  '2026-12-25',
]);

// History window. Starts in January so the Republic Day leave request falls inside it.
const HISTORY_FROM = '2026-01-01';
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// deterministic PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260822);
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;

// ---------------------------------------------------------------------------
// dates
// ---------------------------------------------------------------------------
const MS_DAY = 86_400_000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const toDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => toDate(toMs(d) + n * MS_DAY);
const dow = (d) => new Date(toMs(d)).getUTCDay(); // 0 Sun .. 6 Sat
const isWeekend = (d) => dow(d) === 0 || dow(d) === 6;
const isHoliday = (d) => HOLIDAYS.has(d);
const isWorkingDay = (d) => !isWeekend(d) && !isHoliday(d);

function eachDay(from, to) {
  const out = [];
  for (let ms = toMs(from); ms <= toMs(to); ms += MS_DAY) out.push(toDate(ms));
  return out;
}
const workingDaysBetween = (from, to) => eachDay(from, to).filter(isWorkingDay).length;

/** An instant, as both a JS Date and a SQL literal, for a wall-clock time in IST. */
function instant(date, hhmm) {
  const iso = `${date}T${hhmm}:00${TZ_OFFSET}`;
  return { js: new Date(iso), sql: `'${date} ${hhmm}:00${TZ_OFFSET}'::timestamptz` };
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------
const sq = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);
const empId = (code) => `(SELECT employee_id FROM seed_emp WHERE code = ${sq(code)})`;
const userId = (code) => `(SELECT user_id FROM seed_emp WHERE code = ${sq(code)})`;
const reqId = (key) => `(SELECT request_id FROM seed_req WHERE key = ${sq(key)})`;
const salId = (key) => `(SELECT version_id FROM seed_sal WHERE key = ${sq(key)})`;
const typeId = (code) => `(SELECT id FROM leave_types WHERE code = ${sq(code)})`;
const deptId = (code) => `(SELECT id FROM departments WHERE code = ${sq(code)})`;

// ---------------------------------------------------------------------------
// the roster
//
// Departments are ENG / PPL / FIN / SLS - the four in 01_reference.sql. The seed plan
// asks for "Design" instead of Sales; Design does not exist in the reference data, and
// inventing it would either leave Sales with no employees (so it vanishes from the
// attendance chart, which inner-joins departments) or make five departments where the
// plan says four. Sales carries the plan's two Design headcount instead.
//
// Every employee has a department, without exception: KPI 1 in §7 inner-joins
// departments and silently drops anyone without one.
// ---------------------------------------------------------------------------
const ROSTER = [
  { code: 'DF-001', name: 'Meera Nair',      dept: 'PPL', role: 'ADMIN',    title: 'Head of People',      joined: '2024-03-04', ctc: '2400000', archetype: 'punctual' },
  { code: 'DF-002', name: 'Arjun Rao',       dept: 'PPL', role: 'ADMIN',    title: 'Operations Director', joined: '2024-06-17', ctc: '2200000', archetype: 'punctual' },
  { code: 'DF-003', name: 'Nita Sharma',     dept: 'PPL', role: 'HR',       title: 'HR Manager',          joined: '2024-09-02', ctc: '1400000', archetype: 'average'  },
  { code: 'DF-004', name: 'Vikram Desai',    dept: 'ENG', role: 'EMPLOYEE', title: 'Engineering Lead',    joined: '2024-01-15', ctc: '2000000', archetype: 'punctual' },
  { code: 'DF-005', name: 'Priya Menon',     dept: 'ENG', role: 'EMPLOYEE', title: 'Senior Engineer',     joined: '2025-02-10', ctc: '1600000', archetype: 'average'  },
  { code: 'DF-006', name: 'Rahul Iyer',      dept: 'ENG', role: 'EMPLOYEE', title: 'Backend Engineer',    joined: '2025-07-21', ctc: '1200000', archetype: 'late'     },
  { code: 'DF-007', name: 'Ananya Ghosh',    dept: 'ENG', role: 'EMPLOYEE', title: 'Frontend Engineer',   joined: '2025-11-03', ctc: '1150000', archetype: 'edgy'     },
  { code: 'DF-008', name: 'Sanjay Kulkarni', dept: 'FIN', role: 'EMPLOYEE', title: 'Finance Manager',     joined: '2024-05-06', ctc: '1500000', archetype: 'punctual' },
  { code: 'DF-009', name: 'Kavita Reddy',    dept: 'FIN', role: 'EMPLOYEE', title: 'Accountant',          joined: '2025-03-17', ctc: '900000',  archetype: 'average'  },
  { code: 'DF-010', name: 'Imran Sheikh',    dept: 'FIN', role: 'EMPLOYEE', title: 'Payroll Analyst',     joined: '2026-02-02', ctc: '850000',  archetype: 'average'  },
  { code: 'DF-011', name: 'Deepa Nambiar',   dept: 'SLS', role: 'EMPLOYEE', title: 'Account Executive',   joined: '2025-06-09', ctc: '1100000', archetype: 'edgy'     },
  { code: 'DF-012', name: 'Farhan Qureshi',  dept: 'SLS', role: 'EMPLOYEE', title: 'Sales Associate',     joined: '2025-10-13', ctc: '950000',  archetype: 'late'     },
];

const byCode = Object.fromEntries(ROSTER.map((r) => [r.code, r]));
const LOW_BALANCE = 'DF-010'; // the insufficient-balance demo account

const MANAGERS = {
  'DF-003': 'DF-001', 'DF-004': 'DF-001', 'DF-008': 'DF-001', 'DF-011': 'DF-002',
  'DF-005': 'DF-004', 'DF-006': 'DF-004', 'DF-007': 'DF-004',
  'DF-009': 'DF-008', 'DF-010': 'DF-008', 'DF-012': 'DF-011',
};

const email = (name) => `${name.toLowerCase().replaceAll(' ', '.')}@dayflow.example`;

// ---------------------------------------------------------------------------
// leave requests
// ---------------------------------------------------------------------------
const REMARKS = [
  'Family function', 'Medical appointment', 'Personal work', 'Travelling home',
  'Wedding in the family', 'Not well', 'Moving house', 'Festival at home',
];

/** Working days in an inclusive range - what a request actually costs (§5.1 step 2). */
const dayCountFor = (start, end) => workingDaysBetween(start, end);

const leaveRequests = [];
let leaveSeq = 0;
function addLeave(spec) {
  leaveSeq += 1;
  const key = `L${String(leaveSeq).padStart(2, '0')}`;
  leaveRequests.push({ key, ...spec });
  return key;
}

/**
 * Windows are laid out sequentially with gaps per employee, so no two LIVE requests can
 * overlap - the no_overlapping_live_leave EXCLUDE constraint rejects PENDING/APPROVED
 * overlaps outright, and a seed that trips it takes the whole file down.
 */
function planLeaveFor(person, windows) {
  let cursor = null;
  for (const w of windows) {
    const start = w.start;
    const end = w.end;
    if (cursor && toMs(start) <= toMs(cursor)) continue;
    const days = dayCountFor(start, end);
    if (days === 0) continue;
    addLeave({
      person: person.code,
      type: w.type ?? 'PAID',
      start,
      end,
      days,
      status: w.status,
      remarks: w.remarks ?? pick(REMARKS),
      createdAt: w.createdAt ?? addDays(start, -12),
    });
    // Live requests reserve their window; terminal ones do not.
    if (w.status === 'PENDING' || w.status === 'APPROVED') cursor = end;
  }
}

// Priya's Republic Day request: Fri 23 Jan to Wed 28 Jan 2026 spans a weekend AND
// Monday 26 January, so six calendar days cost only three leave days.
addLeave({
  person: 'DF-005', type: 'PAID', start: '2026-01-23', end: '2026-01-28',
  days: dayCountFor('2026-01-23', '2026-01-28'), status: 'APPROVED',
  remarks: 'Republic Day long weekend - visiting family',
  createdAt: '2026-01-09',
});

planLeaveFor(byCode['DF-004'], [
  { start: '2026-02-16', end: '2026-02-18', status: 'APPROVED' },
  { start: '2026-05-11', end: '2026-05-15', status: 'APPROVED' },
  { start: '2026-09-14', end: '2026-09-16', status: 'PENDING', remarks: 'Sabbatical planning' },
]);
planLeaveFor(byCode['DF-005'], [
  { start: '2026-04-06', end: '2026-04-08', status: 'REJECTED', remarks: 'Short-notice trip' },
  { start: '2026-06-15', end: '2026-06-17', status: 'APPROVED' },
  { start: '2026-09-21', end: '2026-09-22', status: 'PENDING' },
]);
planLeaveFor(byCode['DF-006'], [
  { start: '2026-03-09', end: '2026-03-11', type: 'SICK', status: 'APPROVED', remarks: 'Viral fever' },
  { start: '2026-07-06', end: '2026-07-10', status: 'CANCELLED_AFTER_APPROVAL', remarks: 'Trip called off' },
  { start: '2026-09-28', end: '2026-09-29', status: 'PENDING' },
]);
planLeaveFor(byCode['DF-007'], [
  { start: '2026-02-09', end: '2026-02-10', type: 'SICK', status: 'APPROVED' },
  { start: '2026-06-01', end: '2026-06-05', status: 'REJECTED', remarks: 'Clashes with release week' },
  { start: '2026-08-03', end: '2026-08-04', status: 'APPROVED' },
]);
planLeaveFor(byCode['DF-008'], [
  { start: '2026-03-23', end: '2026-03-27', status: 'APPROVED', remarks: 'Annual holiday' },
  { start: '2026-08-10', end: '2026-08-11', status: 'APPROVED' },
]);
planLeaveFor(byCode['DF-009'], [
  { start: '2026-04-20', end: '2026-04-21', type: 'SICK', status: 'APPROVED' },
  { start: '2026-07-13', end: '2026-07-14', status: 'CANCELLED', remarks: 'Changed my mind' },
  { start: '2026-09-07', end: '2026-09-11', status: 'PENDING', remarks: 'Wedding season' },
]);
planLeaveFor(byCode['DF-011'], [
  { start: '2026-02-23', end: '2026-02-24', status: 'APPROVED' },
  { start: '2026-05-25', end: '2026-05-26', type: 'SICK', status: 'APPROVED' },
  { start: '2026-08-17', end: '2026-08-19', status: 'REJECTED', remarks: 'Quarter close' },
]);
planLeaveFor(byCode['DF-012'], [
  { start: '2026-03-16', end: '2026-03-18', status: 'APPROVED' },
  { start: '2026-06-22', end: '2026-06-23', type: 'UNPAID', status: 'APPROVED', remarks: 'Unpaid personal leave' },
  { start: '2026-09-01', end: '2026-09-02', status: 'PENDING' },
]);
planLeaveFor(byCode['DF-003'], [
  { start: '2026-05-04', end: '2026-05-06', status: 'APPROVED' },
  { start: '2026-08-24', end: '2026-08-25', status: 'PENDING', remarks: 'Long weekend' },
]);
planLeaveFor(byCode['DF-001'], [{ start: '2026-04-13', end: '2026-04-17', status: 'APPROVED', remarks: 'Annual leave' }]);
planLeaveFor(byCode['DF-002'], [{ start: '2026-07-20', end: '2026-07-22', status: 'APPROVED' }]);

// The low-balance account. One approved 3-day leave is what takes the ledger down to
// exactly 1.50; see the ledger section below.
planLeaveFor(byCode[LOW_BALANCE], [
  { start: '2026-05-18', end: '2026-05-20', status: 'APPROVED', remarks: 'Family visit' },
]);

/** Approved leave that actually blocks attendance, keyed by employee. */
const approvedLeaveByPerson = new Map();
for (const l of leaveRequests) {
  if (l.status !== 'APPROVED' && l.status !== 'CANCELLED_AFTER_APPROVAL') continue;
  if (!approvedLeaveByPerson.has(l.person)) approvedLeaveByPerson.set(l.person, []);
  approvedLeaveByPerson.get(l.person).push(l);
}
// A leave that was cancelled after approval no longer keeps anyone off work.
const liveApproved = (person, date) =>
  (approvedLeaveByPerson.get(person) ?? []).find(
    (l) => l.status === 'APPROVED' && l.start <= date && date <= l.end
  ) ?? null;

// ---------------------------------------------------------------------------
// attendance: punches, then attendance_days derived by the real deriveDay()
// ---------------------------------------------------------------------------
const ARCHETYPES = {
  punctual: { absent: 0.01, half: 0.01, inFrom: 9 * 60, inSpread: 20, hours: 9.0, edgeBias: 0 },
  average: { absent: 0.03, half: 0.02, inFrom: 9 * 60 + 20, inSpread: 35, hours: 8.7, edgeBias: 0 },
  late: { absent: 0.04, half: 0.04, inFrom: 10 * 60, inSpread: 45, hours: 8.2, edgeBias: 0 },
  // Skews absences onto Mondays and Fridays, which is what KPI 2 in §7 looks for.
  edgy: { absent: 0.05, half: 0.03, inFrom: 9 * 60 + 40, inSpread: 40, hours: 8.4, edgeBias: 0.22 },
};

const hhmm = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;

const punchRows = [];
const attendanceRows = [];

for (const person of ROSTER) {
  const cfg = ARCHETYPES[person.archetype];
  const from = person.joined > HISTORY_FROM ? person.joined : HISTORY_FROM;

  for (const date of eachDay(from, TODAY)) {
    const leave = liveApproved(person.code, date);
    const punches = [];

    if (isWorkingDay(date) && !leave) {
      const edgeDay = dow(date) === 1 || dow(date) === 5;
      const absentChance = cfg.absent + (edgeDay ? cfg.edgeBias : 0);

      if (!chance(absentChance)) {
        const inMin = cfg.inFrom + Math.floor(rand() * cfg.inSpread);
        const worked = chance(cfg.half) ? 4 + rand() * 0.4 : cfg.hours + (rand() - 0.5) * 0.8;
        const outMin = inMin + Math.round(worked * 60);

        const punchIn = instant(date, hhmm(inMin));
        const punchOut = instant(date, hhmm(outMin));
        punches.push({ punch_at: punchIn.js, direction: 'IN', sql: punchIn.sql });
        punches.push({ punch_at: punchOut.js, direction: 'OUT', sql: punchOut.sql });

        punchRows.push({ person: person.code, sql: punchIn.sql, direction: 'IN' });
        punchRows.push({ person: person.code, sql: punchOut.sql, direction: 'OUT' });
      }
    }

    // The real §5.3 implementation, not a copy of it.
    const derived = deriveDay({
      workDate: date,
      punches,
      isHoliday: isHoliday(date),
      leave: leave ? { id: leave.key } : null,
    });

    attendanceRows.push({
      person: person.code,
      date,
      status: derived.status,
      minutes: derived.workedMinutes,
      firstIn: punches.find((p) => p.direction === 'IN')?.sql ?? null,
      lastOut: [...punches].reverse().find((p) => p.direction === 'OUT')?.sql ?? null,
      leaveKey: derived.leaveRequestId,
    });
  }
}

// ---------------------------------------------------------------------------
// leave ledger
//
// Opening entitlement is pro-rated across the months remaining in the joining year and
// capped, mirroring what registration grants. Approved paid leave consumes; a leave
// cancelled after approval is compensated by a REVERSAL, never by deleting the CONSUMED
// row (§1.2).
// ---------------------------------------------------------------------------
const ACCRUAL = { PAID: 1.5, SICK: 0.5 };
const CAP = { PAID: 18, SICK: 6 };

function openingFor(person, type) {
  const joinedYear = Number(person.joined.slice(0, 4));
  const currentYear = Number(TODAY.slice(0, 4));
  const months = joinedYear === currentYear ? 13 - Number(person.joined.slice(5, 7)) : 12;
  return Math.min(ACCRUAL[type] * months, CAP[type]);
}

const ledgerRows = [];
for (const person of ROSTER) {
  for (const type of ['PAID', 'SICK']) {
    let opening = openingFor(person, type);

    if (person.code === LOW_BALANCE && type === 'PAID') {
      // Deliberately constructed so the ledger SUM lands on exactly 1.50 at demo time:
      // 3.00 opening + 1.50 accrued - 3.00 consumed by the approved May leave.
      opening = 3.0;
    }

    ledgerRows.push({
      person: person.code, type, delta: opening.toFixed(2), reason: 'OPENING',
      note: 'Opening balance on joining, pro-rated from date of joining',
      at: `${person.joined} 09:00:00${TZ_OFFSET}`, ref: null,
    });
  }

  if (person.code === LOW_BALANCE) {
    ledgerRows.push({
      person: person.code, type: 'PAID', delta: '1.50', reason: 'ACCRUAL',
      note: 'Monthly accrual', at: `2026-06-01 00:05:00${TZ_OFFSET}`, ref: null,
    });
  }
}

for (const l of leaveRequests) {
  if (l.type === 'UNPAID') continue; // unpaid leave never moves the ledger
  if (l.status === 'APPROVED' || l.status === 'CANCELLED_AFTER_APPROVAL') {
    ledgerRows.push({
      person: l.person, type: l.type, delta: (-l.days).toFixed(2), reason: 'CONSUMED',
      note: `Approved leave ${l.start} to ${l.end}`,
      at: `${addDays(l.start, -3)} 11:00:00${TZ_OFFSET}`, ref: l.key,
    });
  }
  if (l.status === 'CANCELLED_AFTER_APPROVAL') {
    ledgerRows.push({
      person: l.person, type: l.type, delta: l.days.toFixed(2), reason: 'REVERSAL',
      note: `Cancellation of approved leave ${l.start} to ${l.end}`,
      at: `${addDays(l.start, -1)} 16:30:00${TZ_OFFSET}`, ref: l.key,
    });
  }
}

// ---------------------------------------------------------------------------
// approval steps
//
// Routing follows approval_chain_rules: up to 2 days is HR alone, more than 2 days is
// HR then ADMIN. Approvers are chosen so nobody decides their own request and no single
// person signs off two steps of one request - the same rules the engine enforces.
// ---------------------------------------------------------------------------
const HR_APPROVERS = ['DF-003', 'DF-001', 'DF-002'];
const ADMIN_APPROVERS = ['DF-001', 'DF-002'];

const chainFor = (days) => (days <= 2 ? [{ step: 1, role: 'HR' }] : [{ step: 1, role: 'HR' }, { step: 2, role: 'ADMIN' }]);

function chooseApprover(candidates, { applicant, alreadyUsed }) {
  return candidates.find((c) => c !== applicant && !alreadyUsed.includes(c)) ?? null;
}

const stepRows = [];
for (const l of leaveRequests) {
  const chain = chainFor(l.days);
  const used = [];
  const terminal = l.status === 'APPROVED' || l.status === 'CANCELLED_AFTER_APPROVAL';

  chain.forEach(({ step, role }, index) => {
    const pool = role === 'HR' ? HR_APPROVERS : ADMIN_APPROVERS;
    let status = 'PENDING';
    let approver = null;
    let actedAt = null;

    if (terminal) {
      status = 'APPROVED';
      approver = chooseApprover(pool, { applicant: l.person, alreadyUsed: used });
      actedAt = `${addDays(l.start, -5 + index)} 10:30:00${TZ_OFFSET}`;
    } else if (l.status === 'REJECTED') {
      status = index === 0 ? 'REJECTED' : 'SKIPPED';
      if (index === 0) {
        approver = chooseApprover(pool, { applicant: l.person, alreadyUsed: used });
        actedAt = `${addDays(l.start, -5)} 10:30:00${TZ_OFFSET}`;
      }
    } else if (l.status === 'CANCELLED') {
      status = 'SKIPPED';
      actedAt = `${addDays(l.start, -2)} 09:15:00${TZ_OFFSET}`;
    }

    if (approver) used.push(approver);
    stepRows.push({ requestKey: l.key, step, role, status, approver, actedAt, comment: statusComment(l, status) });
  });

  l.currentStep = l.status === 'PENDING' ? 1 : chain.length;
}

function statusComment(leave, status) {
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return leave.remarks?.includes('release') ? 'Clashes with the release window' : 'Cannot approve at short notice';
  return null;
}

// ---------------------------------------------------------------------------
// salary versions
//
// A revision closes the previous version on the day the new one starts. validity is a
// half-open daterange, so consecutive versions are adjacent rather than overlapping and
// no_overlapping_salary is satisfied by construction.
// ---------------------------------------------------------------------------
const REVISIONS = {
  'DF-004': { from: '2026-04-01', ctc: '2300000' },
  'DF-005': { from: '2026-04-01', ctc: '1800000' },
  'DF-009': { from: '2026-07-01', ctc: '1050000' },
};

/**
 * Exact integer paise. Mirrors deriveComponents() in payroll.service.js: SPECIAL is the
 * remainder rather than a third percentage, so earnings total the monthly gross exactly.
 */
const toPaise = (v) => { const [w, f = ''] = String(v).split('.'); return BigInt(w) * 100n + BigInt(`${f}00`.slice(0, 2)); };
const fromPaise = (p) => `${p / 100n}.${String(p % 100n).padStart(2, '0')}`;

function components(ctc) {
  const gross = toPaise(ctc) / 12n;
  const basic = (gross * 40n) / 100n;
  const hra = (basic * 50n) / 100n;
  return [
    ['BASIC', 'Basic Salary', 'EARNING', fromPaise(basic)],
    ['HRA', 'House Rent Allowance', 'EARNING', fromPaise(hra)],
    ['SPECIAL', 'Special Allowance', 'EARNING', fromPaise(gross - basic - hra)],
    ['PF', 'Provident Fund', 'DEDUCTION', fromPaise((basic * 12n) / 100n)],
    ['PT', 'Professional Tax', 'DEDUCTION', fromPaise(20000n)],
  ];
}

const salaryVersions = [];
for (const person of ROSTER) {
  const revision = REVISIONS[person.code];
  salaryVersions.push({
    key: `${person.code}-v1`, person: person.code, from: person.joined,
    to: revision ? revision.from : null, ctc: person.ctc,
  });
  if (revision) {
    salaryVersions.push({ key: `${person.code}-v2`, person: person.code, from: revision.from, to: null, ctc: revision.ctc });
  }
}
const versionOn = (person, date) =>
  salaryVersions.find((v) => v.person === person && v.from <= date && (v.to === null || date < v.to));

// ---------------------------------------------------------------------------
// payslips for the two most recent complete months
// ---------------------------------------------------------------------------
function monthsBefore(today, count) {
  const out = [];
  const [y, m] = today.split('-').map(Number);
  for (let i = 1; i <= count; i += 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out.reverse();
}
const PAYROLL_MONTHS = monthsBefore(TODAY, 2);

const payslips = [];
for (const month of PAYROLL_MONTHS) {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const working = workingDaysBetween(first, last);

  for (const person of ROSTER) {
    if (person.joined > last) continue;
    const version = versionOn(person.code, last);
    if (!version) continue;

    // LOP is an ABSENT day, or a day of approved UNPAID leave - paid leave costs nothing.
    const lop = attendanceRows.filter(
      (r) => r.person === person.code && r.date >= first && r.date <= last &&
        (r.status === 'ABSENT' ||
          (r.status === 'ON_LEAVE' && leaveRequests.find((l) => l.key === r.leaveKey)?.type === 'UNPAID'))
    ).length;

    payslips.push({
      person: person.code, month: first, versionKey: version.key,
      working, payable: Math.max(0, working - lop), lop,
    });
  }
}

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------
const notificationRows = [];
for (const l of leaveRequests) {
  const person = byCode[l.person];
  if (l.status === 'PENDING') {
    const role = chainFor(l.days)[0].role;
    for (const approver of ROSTER.filter((r) => r.role === role)) {
      if (approver.code === l.person) continue;
      notificationRows.push({
        user: approver.code, title: 'Leave request awaiting your approval',
        body: `${person.name} requested ${l.days} day(s) of ${l.type} leave from ${l.start} to ${l.end}.`,
        link: `/admin/approvals?request=${l.key}`, at: `${l.createdAt} 12:00:00${TZ_OFFSET}`, read: false,
      });
    }
  } else if (l.status === 'APPROVED') {
    notificationRows.push({
      user: l.person, title: 'Your leave request was approved',
      body: `${l.type} leave from ${l.start} to ${l.end} (${l.days} day(s)) was approved.`,
      link: `/leave/requests/${l.key}`, at: `${addDays(l.start, -4)} 10:35:00${TZ_OFFSET}`, read: chance(0.6),
    });
  } else if (l.status === 'REJECTED') {
    notificationRows.push({
      user: l.person, title: 'Your leave request was rejected',
      body: `${l.type} leave from ${l.start} to ${l.end} was rejected.`,
      link: `/leave/requests/${l.key}`, at: `${addDays(l.start, -5)} 10:35:00${TZ_OFFSET}`, read: chance(0.4),
    });
  }
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------
const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
const out = [];
const w = (line = '') => out.push(line);

w('-- 02_demo_data.sql');
w('--');
w(`-- GENERATED by scripts/generate-seed.js on ${TODAY}. Do not edit by hand.`);
w('-- Regenerate with:  node scripts/generate-seed.js');
w('--');
w(`-- ${ROSTER.length} employees across 4 departments, attendance from ${HISTORY_FROM} to ${TODAY},`);
w(`-- ${leaveRequests.length} leave requests, ${salaryVersions.length} salary versions, ${payslips.length} payslips.`);
w('--');
w(`-- Every demo account signs in with the password: ${DEMO_PASSWORD}`);
w('-- All are ACTIVE with email_verified_at set, so no verification step is needed.');
w('--');
w('-- Leave balances are NOT stored anywhere. They are the SUM of the ledger rows below,');
w('-- read through v_leave_balances (CLAUDE.md §1.1).');
w('--');
w('-- Intended for a freshly migrated database. Running it twice raises an exception');
w('-- rather than duplicating the ledger, which would silently corrupt every balance.');
w('');
w('BEGIN;');
w('');
w('DO $$');
w('BEGIN');
w("  IF EXISTS (SELECT 1 FROM users WHERE employee_code LIKE 'DF-%') THEN");
w("    RAISE EXCEPTION 'Demo data is already present. Start from a clean database: npm run db:reset && npm run migrate && npm run seed';");
w('  END IF;');
w('END $$;');
w('');
w('CREATE TEMP TABLE seed_emp (code TEXT PRIMARY KEY, user_id BIGINT, employee_id BIGINT) ON COMMIT DROP;');
w('CREATE TEMP TABLE seed_req (key TEXT PRIMARY KEY, request_id BIGINT) ON COMMIT DROP;');
w('CREATE TEMP TABLE seed_sal (key TEXT PRIMARY KEY, version_id BIGINT) ON COMMIT DROP;');
w('');

w('-- ---------------------------------------------------------------------------');
w('-- Users and employees. Every employee has a department: KPI 1 in §7 inner-joins');
w('-- departments and would silently drop anyone without one.');
w('-- ---------------------------------------------------------------------------');
for (const p of ROSTER) {
  w(`WITH u AS (`);
  w(`  INSERT INTO users (employee_code, email, password_hash, role, status, email_verified_at, created_at)`);
  w(`  VALUES (${sq(p.code)}, ${sq(email(p.name))}, ${sq(passwordHash)}, ${sq(p.role)}::user_role, 'ACTIVE',`);
  w(`          ${sq(`${p.joined} 09:30:00${TZ_OFFSET}`)}::timestamptz, ${sq(`${p.joined} 09:00:00${TZ_OFFSET}`)}::timestamptz)`);
  w(`  RETURNING id`);
  w(`), e AS (`);
  w(`  INSERT INTO employees (user_id, full_name, department_id, designation, date_of_joining, phone, address)`);
  w(`  SELECT u.id, ${sq(p.name)}, ${deptId(p.dept)}, ${sq(p.title)}, DATE ${sq(p.joined)},`);
  w(`         ${sq(`+91 9${String(80000000 + Math.floor(rand() * 19999999))}`)}, ${sq(`${1 + Math.floor(rand() * 200)} ${pick(['MG Road', 'Residency Road', 'Indiranagar', 'Koramangala', 'Jayanagar'])}, Bengaluru`)}`);
  w(`  FROM u RETURNING id, user_id`);
  w(`)`);
  w(`INSERT INTO seed_emp (code, user_id, employee_id) SELECT ${sq(p.code)}, e.user_id, e.id FROM e;`);
}
w('');
w('-- Reporting lines, applied once every employee row exists.');
for (const [person, manager] of Object.entries(MANAGERS)) {
  w(`UPDATE employees SET manager_id = ${empId(manager)} WHERE id = ${empId(person)};`);
}
w('');

w('-- ---------------------------------------------------------------------------');
w('-- Leave requests. Windows per employee never overlap while PENDING or APPROVED;');
w('-- the no_overlapping_live_leave EXCLUDE constraint would reject the file otherwise.');
w('-- ---------------------------------------------------------------------------');
for (const l of leaveRequests) {
  const status = l.status === 'CANCELLED_AFTER_APPROVAL' ? 'CANCELLED' : l.status;
  const decided = status === 'PENDING' ? 'NULL' : sq(`${addDays(l.start, -4)} 10:40:00${TZ_OFFSET}`) + '::timestamptz';
  w(`WITH r AS (`);
  w(`  INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, day_count, remarks, status, current_step, created_at, decided_at)`);
  w(`  VALUES (${empId(l.person)}, ${typeId(l.type)}, DATE ${sq(l.start)}, DATE ${sq(l.end)}, ${l.days.toFixed(2)}, ${sq(l.remarks)},`);
  w(`          ${sq(status)}::leave_status, ${l.currentStep}, ${sq(`${l.createdAt} 11:45:00${TZ_OFFSET}`)}::timestamptz, ${decided})`);
  w(`  RETURNING id`);
  w(`)`);
  w(`INSERT INTO seed_req (key, request_id) SELECT ${sq(l.key)}, r.id FROM r;`);
}
w('');

w('-- Approval steps. No approver decides their own request, and no single person');
w('-- signs off two steps of the same request.');
for (const s of stepRows) {
  w(
    `INSERT INTO approval_steps (request_id, step_no, approver_role, approver_user_id, status, comment, acted_at) VALUES (` +
      `${reqId(s.requestKey)}, ${s.step}, ${sq(s.role)}::user_role, ${s.approver ? userId(s.approver) : 'NULL'}, ` +
      `${sq(s.status)}::step_status, ${sq(s.comment)}, ${s.actedAt ? `${sq(s.actedAt)}::timestamptz` : 'NULL'});`
  );
}
w('');

w('-- ---------------------------------------------------------------------------');
w('-- Leave ledger - the only place a balance comes from.');
w('-- A cancelled-after-approval request keeps its CONSUMED row and gains a REVERSAL,');
w('-- because the ledger is append-only (§1.2).');
w('-- ---------------------------------------------------------------------------');
for (const r of ledgerRows) {
  w(
    `INSERT INTO leave_balance_ledger (employee_id, leave_type_id, delta, reason, ref_request_id, note, created_at) VALUES (` +
      `${empId(r.person)}, ${typeId(r.type)}, ${r.delta}, ${sq(r.reason)}::ledger_reason, ` +
      `${r.ref ? reqId(r.ref) : 'NULL'}, ${sq(r.note)}, ${sq(r.at)}::timestamptz);`
  );
}
w('');

w('-- ---------------------------------------------------------------------------');
w('-- Attendance punches (server-time instants, written explicitly here).');
w('-- ---------------------------------------------------------------------------');
for (let i = 0; i < punchRows.length; i += 200) {
  const chunk = punchRows.slice(i, i + 200);
  w('INSERT INTO attendance_punches (employee_id, punch_at, direction, source) VALUES');
  chunk.forEach((p, idx) => {
    w(`  (${empId(p.person)}, ${p.sql}, ${sq(p.direction)}::punch_direction, 'SEED')${idx === chunk.length - 1 ? ';' : ','}`);
  });
}
w('');

w('-- ---------------------------------------------------------------------------');
w('-- attendance_days, produced by the real deriveDay() at generation time.');
w('-- POST /attendance/recompute rebuilds these rows identically - the derivation is a');
w('-- pure function of punches, leave and the holiday calendar (§5.3).');
w('-- ---------------------------------------------------------------------------');
for (let i = 0; i < attendanceRows.length; i += 200) {
  const chunk = attendanceRows.slice(i, i + 200);
  w('INSERT INTO attendance_days (employee_id, work_date, status, worked_minutes, first_in, last_out, leave_request_id) VALUES');
  chunk.forEach((r, idx) => {
    w(
      `  (${empId(r.person)}, DATE ${sq(r.date)}, ${sq(r.status)}::day_status, ${r.minutes}, ` +
        `${r.firstIn ?? 'NULL'}, ${r.lastOut ?? 'NULL'}, ${r.leaveKey ? reqId(r.leaveKey) : 'NULL'})${idx === chunk.length - 1 ? ';' : ','}`
    );
  });
}
w('');

w('-- ---------------------------------------------------------------------------');
w('-- Salary versions. Each revision closes the previous version on the day the new one');
w('-- starts; half-open validity keeps them adjacent, never overlapping.');
w('-- ---------------------------------------------------------------------------');
for (const v of salaryVersions) {
  w(`WITH s AS (`);
  w(`  INSERT INTO employee_salary_versions (employee_id, effective_from, effective_to, ctc_annual, created_by, created_at)`);
  w(`  VALUES (${empId(v.person)}, DATE ${sq(v.from)}, ${v.to ? `DATE ${sq(v.to)}` : 'NULL'}, ${v.ctc}, ${userId('DF-001')}, ${sq(`${v.from} 09:00:00${TZ_OFFSET}`)}::timestamptz)`);
  w(`  RETURNING id`);
  w(`)`);
  w(`INSERT INTO seed_sal (key, version_id) SELECT ${sq(v.key)}, s.id FROM s;`);
  for (const [code, label, kind, amount] of components(v.ctc)) {
    w(
      `INSERT INTO salary_components (salary_version_id, code, label, kind, monthly_amount) VALUES (` +
        `${salId(v.key)}, ${sq(code)}, ${sq(label)}, ${sq(kind)}::component_kind, ${amount});`
    );
  }
}
w('');

w('-- ---------------------------------------------------------------------------');
w('-- Payslips for the two most recent complete months.');
w('-- Amounts are computed by the SAME expression payroll.queries.js uses, so a seeded');
w('-- payslip and one produced by POST /payroll/runs agree to the paisa.');
w('-- ---------------------------------------------------------------------------');
for (const p of payslips) {
  const prorated = `ROUND(sc.monthly_amount * ${p.payable}::numeric / NULLIF(${p.working}, 0)::numeric, 2)`;
  w(`WITH comp AS (`);
  w(`  SELECT sc.kind, sc.code, sc.label, ${prorated} AS amount`);
  w(`  FROM salary_components sc WHERE sc.salary_version_id = ${salId(p.versionKey)}`);
  w(`), totals AS (`);
  w(`  SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'EARNING'), 0) AS gross,`);
  w(`         COALESCE(SUM(amount) FILTER (WHERE kind = 'DEDUCTION'), 0) AS deductions FROM comp`);
  w(`), slip AS (`);
  w(`  INSERT INTO payslips (employee_id, period_month, salary_version_id, payable_days, lop_days,`);
  w(`                        gross_earnings, total_deductions, net_pay, generated_by, generated_at)`);
  w(`  SELECT ${empId(p.person)}, DATE ${sq(p.month)}, ${salId(p.versionKey)}, ${p.payable}, ${p.lop},`);
  w(`         t.gross, t.deductions, t.gross - t.deductions, ${userId('DF-001')},`);
  w(`         ${sq(`${p.month} 18:00:00${TZ_OFFSET}`)}::timestamptz`);
  w(`  FROM totals t RETURNING id`);
  w(`)`);
  w(`INSERT INTO payslip_line_items (payslip_id, code, label, kind, amount)`);
  w(`SELECT slip.id, comp.code, comp.label, comp.kind, comp.amount FROM slip, comp;`);
}
w('');

w('-- ---------------------------------------------------------------------------');
w('-- Notifications - the recent-activity feed on the employee dashboard (SRS 3.2.1).');
w('-- ---------------------------------------------------------------------------');
for (const n of notificationRows) {
  w(
    `INSERT INTO notifications (user_id, title, body, link, read_at, created_at) VALUES (` +
      `${userId(n.user)}, ${sq(n.title)}, ${sq(n.body)}, ${sq(n.link)}, ` +
      `${n.read ? `${sq(n.at)}::timestamptz + INTERVAL '2 hours'` : 'NULL'}, ${sq(n.at)}::timestamptz);`
  );
}
w('');
w('COMMIT;');
w('');

writeFileSync(OUT, out.join('\n'));

// ---------------------------------------------------------------------------
const lowPaid = ledgerRows
  .filter((r) => r.person === LOW_BALANCE && r.type === 'PAID')
  .reduce((sum, r) => sum + Number(r.delta), 0);

console.log(`wrote ${path.relative(path.join(HERE, '..'), OUT)}`);
console.log(`  employees        ${ROSTER.length} across 4 departments`);
console.log(`  attendance       ${HISTORY_FROM} .. ${TODAY}  (${punchRows.length} punches, ${attendanceRows.length} derived days)`);
console.log(`  leave requests   ${leaveRequests.length}`);
console.log(`  approval steps   ${stepRows.length}`);
console.log(`  ledger rows      ${ledgerRows.length}`);
console.log(`  salary versions  ${salaryVersions.length} (${Object.keys(REVISIONS).length} revisions)`);
console.log(`  payslips         ${payslips.length} for ${PAYROLL_MONTHS.join(', ')}`);
console.log(`  notifications    ${notificationRows.length}`);
console.log(`  demo password    ${DEMO_PASSWORD}`);
console.log(`  low balance      ${LOW_BALANCE} PAID = ${lowPaid.toFixed(2)}`);
process.exit(0);
