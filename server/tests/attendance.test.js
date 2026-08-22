/**
 * CLAUDE.md §12 test 6.
 *
 * The headline case is the one named in the spec - IN 09:00, OUT 13:00 gives HALF_DAY
 * and 240 minutes - asserted twice: against deriveDay() as a pure function, and again
 * end to end through punches, recompute and attendance_days.
 *
 * §12 says six tests and no more, so the pairing edge cases live inside this one rather
 * than sprawling into extra cases.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { pool } from '../src/db/pool.js';
import { deriveDay, recompute } from '../src/modules/attendance/attendance.service.js';
import {
  attendanceDay,
  createEmployee,
  recentWorkingMonday,
  seedPunch,
} from './support/fixtures.js';

after(() => pool.end());

/** Builds the punch rows deriveDay expects from 'HH:MM' pairs on a fixed UTC day. */
const at = (hhmm, direction) => ({
  punch_at: new Date(`2026-06-15T${hhmm}:00Z`), // a Monday
  direction,
});

test('6. attendance: IN 09:00 / OUT 13:00 gives HALF_DAY and 240 minutes', async () => {
  const MONDAY = '2026-06-15';

  // --- the spec case, as a pure function -----------------------------------
  const derived = deriveDay({
    workDate: MONDAY,
    punches: [at('09:00', 'IN'), at('13:00', 'OUT')],
  });

  assert.equal(derived.status, 'HALF_DAY');
  assert.equal(derived.workedMinutes, 240);
  assert.equal(derived.stillIn, false);
  assert.equal(derived.firstIn.toISOString(), '2026-06-15T09:00:00.000Z');
  assert.equal(derived.lastOut.toISOString(), '2026-06-15T13:00:00.000Z');

  // --- the thresholds either side of it ------------------------------------
  assert.equal(
    deriveDay({ workDate: MONDAY, punches: [at('09:00', 'IN'), at('17:00', 'OUT')] }).status,
    'PRESENT',
    '480 minutes is a full day'
  );
  assert.equal(
    deriveDay({ workDate: MONDAY, punches: [at('09:00', 'IN'), at('16:59', 'OUT')] }).status,
    'HALF_DAY',
    'one minute short of 480 is still a half day'
  );
  assert.equal(deriveDay({ workDate: MONDAY, punches: [] }).status, 'ABSENT');
  assert.equal(deriveDay({ workDate: MONDAY, punches: [] }).workedMinutes, 0);

  // --- pairing rules --------------------------------------------------------
  const split = deriveDay({
    workDate: MONDAY,
    punches: [at('09:00', 'IN'), at('12:00', 'OUT'), at('13:00', 'IN'), at('18:00', 'OUT')],
  });
  assert.equal(split.workedMinutes, 180 + 300, 'two intervals are summed');
  assert.equal(split.status, 'PRESENT');

  const trailing = deriveDay({
    workDate: MONDAY,
    punches: [at('09:00', 'IN'), at('13:00', 'OUT'), at('14:00', 'IN')],
  });
  assert.equal(trailing.workedMinutes, 240, 'an unmatched trailing IN banks no time');
  assert.equal(trailing.stillIn, true, 'but the person is still in');

  const doubleIn = deriveDay({
    workDate: MONDAY,
    punches: [at('09:00', 'IN'), at('10:00', 'IN'), at('13:00', 'OUT')],
  });
  assert.equal(doubleIn.workedMinutes, 240, 'a second consecutive IN opens nothing new');

  const orphanOut = deriveDay({ workDate: MONDAY, punches: [at('13:00', 'OUT')] });
  assert.equal(orphanOut.workedMinutes, 0, 'an OUT with no IN contributes nothing');
  assert.equal(orphanOut.status, 'ABSENT');

  // --- §5.3 precedence ------------------------------------------------------
  const worked = [at('09:00', 'IN'), at('13:00', 'OUT')];
  assert.equal(
    deriveDay({ workDate: MONDAY, punches: worked, isHoliday: true }).status,
    'HOLIDAY',
    'a holiday outranks the punches'
  );
  assert.equal(
    deriveDay({ workDate: '2026-06-13', punches: worked }).status,
    'WEEKEND',
    'a Saturday outranks the punches'
  );
  assert.equal(
    deriveDay({ workDate: MONDAY, punches: worked, leave: { id: 42 } }).status,
    'ON_LEAVE',
    'approved leave outranks the punches'
  );
  assert.equal(
    deriveDay({ workDate: MONDAY, punches: worked, isHoliday: true }).workedMinutes,
    240,
    'minutes are still measured on a non-working day'
  );

  // --- end to end: punches -> recompute -> attendance_days ------------------
  const workDate = await recentWorkingMonday();
  const employee = await createEmployee({ dateOfJoining: workDate });
  const admin = await createEmployee({ role: 'ADMIN' });

  await seedPunch(employee.employeeId, workDate, '09:00', 'IN');
  await seedPunch(employee.employeeId, workDate, '13:00', 'OUT');

  const summary = await recompute(admin.actor, {
    employeeId: Number(employee.employeeId),
    from: workDate,
    to: workDate,
  });
  assert.equal(summary.daysWritten, 1);

  const row = await attendanceDay(employee.employeeId, workDate);
  assert.equal(row.status, 'HALF_DAY');
  assert.equal(row.worked_minutes, 240);
  assert.ok(row.first_in, 'first_in is recorded');
  assert.ok(row.last_out, 'last_out is recorded');

  // Purity means re-running changes nothing.
  await recompute(admin.actor, {
    employeeId: Number(employee.employeeId),
    from: workDate,
    to: workDate,
  });
  const again = await attendanceDay(employee.employeeId, workDate);
  assert.equal(again.status, 'HALF_DAY');
  assert.equal(again.worked_minutes, 240);
});
