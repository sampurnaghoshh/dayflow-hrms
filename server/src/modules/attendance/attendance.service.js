/**
 * Attendance business logic. No req, no res, no SQL.
 */
import { pool, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { eachDateInRange, isWeekend } from '../../lib/dates.js';
import { broadcast } from '../../realtime/sse.js';
import * as q from './attendance.queries.js';
import * as leaveQ from '../leave/leave.queries.js';

const TZ = env.APP_TIMEZONE;
const FULL_DAY_MINUTES = 480; // 8h
const HALF_DAY_MINUTES = 240; // 4h

const PRIVILEGED_ROLES = new Set(['HR', 'ADMIN']);
const isPrivileged = (actor) => PRIVILEGED_ROLES.has(actor.role);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const toMs = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime());

/**
 * §5.3, as a pure function of (punches, leave, holiday). No database, no clock.
 *
 * That purity is the point: the same inputs always give the same row, so
 * POST /attendance/recompute can rebuild attendance_days from scratch at any time and
 * get byte-identical results. A punch is never destroyed or edited to fix a day - the
 * derivation is simply run again.
 *
 * Punches are paired chronologically (IN,OUT),(IN,OUT). A second consecutive IN is
 * ignored rather than treated as a new interval, an OUT with nothing open is ignored,
 * and an unmatched trailing IN means the person is still in: their time is not banked
 * until they punch out, so worked_minutes only ever counts closed intervals.
 *
 * @param {object}  input
 * @param {string}  input.workDate   'YYYY-MM-DD'
 * @param {Array<{punch_at: Date|string, direction: 'IN'|'OUT'}>} [input.punches] chronological
 * @param {boolean} [input.isHoliday]
 * @param {{id: string|number}|null} [input.leave] approved leave covering this date
 * @returns {{status: string, workedMinutes: number, firstIn: Date|null, lastOut: Date|null,
 *            stillIn: boolean, leaveRequestId: string|number|null}}
 */
export function deriveDay({ workDate, punches = [], isHoliday = false, leave = null }) {
  let openIn = null;
  let workedMs = 0;
  let firstIn = null;
  let lastOut = null;

  for (const punch of punches) {
    const at = toMs(punch.punch_at);
    if (punch.direction === 'IN') {
      if (firstIn === null) firstIn = at;
      if (openIn === null) openIn = at;
      // else: already inside, so this IN opens nothing new
    } else {
      if (openIn !== null) {
        workedMs += at - openIn;
        openIn = null;
        lastOut = at;
      }
      // else: an OUT with no matching IN contributes nothing
    }
  }

  const workedMinutes = Math.max(0, Math.round(workedMs / 60_000));

  // Precedence is fixed by §5.3: a public holiday outranks a weekend, which outranks
  // approved leave, which outranks whatever the punches say. worked_minutes is still
  // reported on those days, because it is a measurement rather than a classification -
  // somebody who came in on a holiday did work those minutes.
  let status;
  if (isHoliday) status = 'HOLIDAY';
  else if (isWeekend(workDate)) status = 'WEEKEND';
  else if (leave) status = 'ON_LEAVE';
  else if (workedMinutes >= FULL_DAY_MINUTES) status = 'PRESENT';
  else if (workedMinutes >= HALF_DAY_MINUTES) status = 'HALF_DAY';
  else if (workedMinutes > 0) status = 'HALF_DAY';
  else status = 'ABSENT';

  return {
    status,
    workedMinutes,
    firstIn: firstIn === null ? null : new Date(firstIn),
    lastOut: lastOut === null ? null : new Date(lastOut),
    stillIn: openIn !== null,
    leaveRequestId: leave?.id ?? null,
  };
}

/** Rebuilds one (employee, date) row from its punches. Used by punch and by recompute. */
async function recomputeDay(client, { employeeId, workDate }) {
  // Sequential, not Promise.all: these share one transaction client, and a pg client
  // executes a single query at a time. Overlapping them is deprecated and removed in pg 9.
  const punches = await q.getPunchesForDate(client, { employeeId, workDate, timezone: TZ });
  const holidays = await leaveQ.getHolidaysBetween(client, { start: workDate, end: workDate });
  const leaves = await q.getApprovedLeavesInRange(client, {
    employeeId,
    from: workDate,
    to: workDate,
  });

  const derived = deriveDay({
    workDate,
    punches,
    isHoliday: holidays.length > 0,
    leave: leaves[0] ?? null,
  });

  return q.upsertAttendanceDay(client, {
    employeeId,
    workDate,
    status: derived.status,
    workedMinutes: derived.workedMinutes,
    firstIn: derived.firstIn,
    lastOut: derived.lastOut,
    leaveRequestId: derived.leaveRequestId,
  });
}

/**
 * POST /attendance/punch
 *
 * The time is the server's and nothing else (§1.8). The day is recomputed in the same
 * transaction, so attendance_days never lags the punch that changed it.
 */
export async function punch(actor, { direction, idempotencyKey, source }) {
  if (!actor.employeeId) {
    throw notFound('EMPLOYEE_NOT_FOUND', 'This account has no employee record.');
  }

  const result = await withTransaction(async (client) => {
    const workDate = await q.currentWorkDate(client, { timezone: TZ });

    // A retry with a key we have already seen returns the original punch untouched.
    if (idempotencyKey) {
      const existing = await q.findPunchByIdempotencyKey(client, {
        employeeId: actor.employeeId,
        idempotencyKey,
      });
      if (existing) {
        return { punch: existing, duplicate: true, workDate, day: null };
      }
    }

    const last = await q.getLastPunchOfDay(client, {
      employeeId: actor.employeeId,
      workDate,
      timezone: TZ,
    });

    if (direction === 'OUT' && (!last || last.direction === 'OUT')) {
      throw unprocessable(
        'NO_OPEN_PUNCH',
        last
          ? 'You have already checked out. Check in before checking out again.'
          : 'You have not checked in today, so there is nothing to check out of.',
        [{ field: 'direction', issue: 'Check in first' }]
      );
    }

    // The counterpart guard. deriveDay() would ignore a second consecutive IN rather
    // than mis-count it, so this is about telling the user their button was wrong
    // instead of silently accepting a punch that changes nothing.
    if (direction === 'IN' && last && last.direction === 'IN') {
      throw unprocessable(
        'ALREADY_PUNCHED_IN',
        'You are already checked in. Check out before checking in again.',
        [{ field: 'direction', issue: 'Check out first' }]
      );
    }

    const inserted = await q.insertPunch(client, {
      employeeId: actor.employeeId,
      direction,
      source,
      idempotencyKey,
    });

    // DO NOTHING fired: another request with this key landed between our read and our
    // write. Read back what it wrote and report that, rather than failing.
    if (!inserted) {
      const existing = await q.findPunchByIdempotencyKey(client, {
        employeeId: actor.employeeId,
        idempotencyKey,
      });
      return { punch: existing, duplicate: true, workDate, day: null };
    }

    const day = await recomputeDay(client, { employeeId: actor.employeeId, workDate });
    return { punch: inserted, duplicate: false, workDate, day };
  });

  // After COMMIT, never inside it: a subscriber must not hear about a punch that then
  // rolled back.
  if (!result.duplicate) {
    broadcast('attendance:punch', {
      employeeId: String(actor.employeeId),
      direction: result.punch.direction,
      punchAt: result.punch.punch_at,
      workDate: result.workDate,
      status: result.day?.status ?? null,
      workedMinutes: result.day?.worked_minutes ?? 0,
    });
  }

  return result;
}

/** Defaults a missing range to the current calendar month. */
function defaultRange(from, to) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const lastDay = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    from: from ?? `${y}-${m}-01`,
    to: to ?? `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** GET /attendance/me - SRS 3.4.1, daily plus the weekly rollup. */
export async function getMyAttendance(actor, { from, to }) {
  if (!actor.employeeId) {
    throw notFound('EMPLOYEE_NOT_FOUND', 'This account has no employee record.');
  }
  const range = defaultRange(from, to);

  const [days, weekly] = await Promise.all([
    q.getAttendanceDays(pool, { employeeId: actor.employeeId, ...range }),
    q.getWeeklyRollup(pool, { employeeId: actor.employeeId, ...range }),
  ]);

  return { employeeId: String(actor.employeeId), ...range, days, weekly };
}

/** GET /attendance - SRS 3.4.2, HR/ADMIN across employees. */
export async function getAllAttendance(actor, { employeeId, from, to, page, pageSize }) {
  const range = defaultRange(from, to);
  const rows = await q.getAttendanceAcrossEmployees(pool, {
    employeeId,
    ...range,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const total = rows.length > 0 ? rows[0].total_count : 0;
  return {
    data: rows.map(({ total_count, ...row }) => row),
    ...range,
    page,
    pageSize,
    total,
  };
}

/** GET /attendance/today - the live presence board. */
export async function getTodayBoard() {
  const rows = await q.getTodayBoard(pool, { timezone: TZ });
  return {
    workDate: rows[0]?.work_date ?? null,
    presentNow: rows.filter((r) => r.currently_in).length,
    total: rows.length,
    data: rows,
  };
}

/**
 * POST /attendance/recompute - rebuilds attendance_days from punches.
 *
 * Safe to run whenever, because deriveDay() is pure and attendance_punches is
 * append-only: the inputs cannot have changed underneath a previous run except by
 * someone adding a punch, and re-running simply accounts for it.
 *
 * Days before an employee joined are skipped, and so are days in the future - neither
 * is a day they could have attended.
 */
export async function recompute(actor, { employeeId, from, to }) {
  const range = defaultRange(from, to);

  return withTransaction(async (client) => {
    const employees = await q.getActiveEmployees(client, { employeeId: employeeId ?? null });
    if (employeeId && employees.length === 0) {
      throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
    }

    // Pull every input once, then pair them up in memory rather than issuing three
    // queries per employee per day. Sequential because they share one transaction client.
    const punches = await q.getPunchesInRange(client, {
      employeeId: employeeId ?? null,
      ...range,
      timezone: TZ,
    });
    const holidays = await leaveQ.getHolidaysBetween(client, {
      start: range.from,
      end: range.to,
    });
    const leaves = await q.getApprovedLeavesInRange(client, {
      employeeId: employeeId ?? null,
      ...range,
    });

    const holidaySet = new Set(holidays.map((h) => h.holiday_date));

    /** @type {Map<string, Array>} `${employeeId}|${workDate}` -> punches */
    const punchesByKey = new Map();
    for (const p of punches) {
      const key = `${p.employee_id}|${p.work_date}`;
      if (!punchesByKey.has(key)) punchesByKey.set(key, []);
      punchesByKey.get(key).push(p);
    }

    const today = await q.currentWorkDate(client, { timezone: TZ });
    const dates = eachDateInRange(range.from, range.to).filter((d) => d <= today);

    let written = 0;
    for (const employee of employees) {
      const joined = employee.date_of_joining;
      const ownLeaves = leaves.filter((l) => sameId(l.employee_id, employee.id));

      for (const date of dates) {
        if (date < joined) continue;

        const derived = deriveDay({
          workDate: date,
          punches: punchesByKey.get(`${employee.id}|${date}`) ?? [],
          isHoliday: holidaySet.has(date),
          leave: ownLeaves.find((l) => l.start_date <= date && date <= l.end_date) ?? null,
        });

        await q.upsertAttendanceDay(client, {
          employeeId: employee.id,
          workDate: date,
          status: derived.status,
          workedMinutes: derived.workedMinutes,
          firstIn: derived.firstIn,
          lastOut: derived.lastOut,
          leaveRequestId: derived.leaveRequestId,
        });
        written += 1;
      }
    }

    return { ...range, employees: employees.length, daysWritten: written };
  });
}

/** Ownership guard for the HR/ADMIN range endpoint reading one employee. */
export function assertCanReadEmployee(actor, employeeId) {
  if (employeeId == null) return;
  if (isPrivileged(actor) || sameId(employeeId, actor.employeeId)) return;
  throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
}
