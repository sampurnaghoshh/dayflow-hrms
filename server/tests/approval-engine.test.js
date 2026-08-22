/**
 * CLAUDE.md §12 tests 1-5, run against the real database.
 *
 * Test 5 is the one to demo live: two approvers decide the same step at the same
 * instant, one wins and the other gets a 409.
 */
import test, { after, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { pool } from '../src/db/pool.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import * as leaveService from '../src/modules/leave/leave.service.js';
import * as approvalsService from '../src/modules/approvals/approvals.service.js';
import {
  addDays,
  balanceOf,
  createEmployee,
  leaveTypeId,
  ledgerRowsFor,
  mondayWeeksAhead,
  requestStatus,
  stepsFor,
  sumOfDeltas,
} from './support/fixtures.js';

after(() => pool.end());

/** Applies for leave as `employee` and returns the created request plus its steps. */
async function applyForLeave(employee, { code = 'PAID', weeksAhead = 2, days = 3, remarks } = {}) {
  const start = mondayWeeksAhead(weeksAhead);
  const { request } = await leaveService.createLeaveRequest(employee.actor, {
    leaveTypeId: await leaveTypeId(code),
    startDate: start,
    endDate: addDays(start, days - 1),
    remarks,
  });
  return { request, steps: await stepsFor(request.id) };
}

describe('CLAUDE.md §12 - the approval engine', () => {
  // -------------------------------------------------------------------------
  test('1. balance equals SUM(delta) after accrual, consume and reverse', async () => {
    const employee = await createEmployee({ opening: { PAID: '12.00' } });
    const paidId = await leaveTypeId('PAID');

    const write = (delta, reason) =>
      pool.query(
        `INSERT INTO leave_balance_ledger (employee_id, leave_type_id, delta, reason)
         VALUES ($1, $2, $3::numeric, $4::ledger_reason)`,
        [employee.employeeId, paidId, delta, reason]
      );

    await write('1.50', 'ACCRUAL');
    await write('-4.00', 'CONSUMED');
    await write('4.00', 'REVERSAL');

    // 12.00 + 1.50 - 4.00 + 4.00 = 13.50
    assert.equal(await sumOfDeltas(employee.employeeId, 'PAID'), '13.50');
    assert.equal(
      await balanceOf(employee.employeeId, 'PAID'),
      await sumOfDeltas(employee.employeeId, 'PAID'),
      'v_leave_balances must agree with SUM(delta) - there is no stored balance'
    );

    // The reversal compensates; it never removes the row it compensates for.
    const { rows } = await pool.query(
      `SELECT reason FROM leave_balance_ledger WHERE employee_id = $1 ORDER BY id`,
      [employee.employeeId]
    );
    assert.deepEqual(
      rows.map((r) => r.reason),
      ['OPENING', 'ACCRUAL', 'CONSUMED', 'REVERSAL']
    );
  });

  // -------------------------------------------------------------------------
  test('2. approving the final step inserts exactly one CONSUMED row', async () => {
    const employee = await createEmployee({ opening: { PAID: '20.00' } });
    const hr = await createEmployee({ role: 'HR' });
    const admin = await createEmployee({ role: 'ADMIN' });

    // 3 days routes to HR then ADMIN.
    const { request, steps } = await applyForLeave(employee, { days: 3 });
    assert.equal(steps.length, 2, 'a 3-day request should route through two steps');

    const before = await balanceOf(employee.employeeId, 'PAID');

    // Step 1 must move no balance at all.
    await approvalsService.decideStep(hr.actor, steps[0].id, { action: 'APPROVE' });
    assert.equal(await balanceOf(employee.employeeId, 'PAID'), before, 'no balance moves mid-chain');
    assert.equal((await ledgerRowsFor(request.id)).length, 0);

    // Final step consumes.
    const result = await approvalsService.decideStep(admin.actor, steps[1].id, { action: 'APPROVE' });

    const ledger = await ledgerRowsFor(request.id);
    assert.equal(ledger.length, 1, 'exactly one ledger row for the whole approval');
    assert.equal(ledger[0].reason, 'CONSUMED');
    assert.equal(ledger[0].delta, `-${request.day_count}`);
    assert.equal(result.ledgerEntry.reason, 'CONSUMED');

    assert.equal((await requestStatus(request.id)).status, 'APPROVED');
    assert.equal(
      await balanceOf(employee.employeeId, 'PAID'),
      (Number(before) - Number(request.day_count)).toFixed(2)
    );
  });

  // -------------------------------------------------------------------------
  test('3. rejecting inserts zero ledger rows', async () => {
    const employee = await createEmployee({ opening: { PAID: '20.00' } });
    const hr = await createEmployee({ role: 'HR' });

    const { request, steps } = await applyForLeave(employee, { days: 3 });
    const before = await balanceOf(employee.employeeId, 'PAID');

    await approvalsService.decideStep(hr.actor, steps[0].id, {
      action: 'REJECT',
      comment: 'Team is short-staffed that week',
    });

    assert.equal((await ledgerRowsFor(request.id)).length, 0, 'a rejection moves no balance');
    assert.equal(await balanceOf(employee.employeeId, 'PAID'), before);

    const status = await requestStatus(request.id);
    assert.equal(status.status, 'REJECTED');

    // The step that was never reached is closed, not left dangling as PENDING.
    const after = await stepsFor(request.id);
    assert.equal(after[0].status, 'REJECTED');
    assert.equal(after[1].status, 'SKIPPED');
  });

  // -------------------------------------------------------------------------
  test('4. an overlapping leave request raises 23P01 and maps to 409', async () => {
    const employee = await createEmployee({ opening: { PAID: '20.00' } });
    const start = mondayWeeksAhead(3);
    const paidId = await leaveTypeId('PAID');

    await leaveService.createLeaveRequest(employee.actor, {
      leaveTypeId: paidId,
      startDate: start,
      endDate: addDays(start, 2),
    });

    // Overlaps the range above by one day.
    const overlapping = {
      leaveTypeId: paidId,
      startDate: addDays(start, 2),
      endDate: addDays(start, 4),
    };

    // The database refuses it - the EXCLUDE constraint, not application code.
    const raised = await leaveService
      .createLeaveRequest(employee.actor, overlapping)
      .then(() => null, (err) => err);

    assert.ok(raised, 'the second request must be refused');
    assert.equal(raised.code, '23P01', 'exclusion_violation');
    assert.equal(raised.constraint, 'no_overlapping_live_leave');

    // ...and the error handler turns that into a 409 with a usable message.
    const app = express();
    app.get('/overlap', async (req, res, next) => {
      try {
        await leaveService.createLeaveRequest(employee.actor, overlapping);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });
    app.use(errorHandler);

    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/overlap`);
    const body = await response.json();
    server.close();

    assert.equal(response.status, 409);
    assert.equal(body.error.code, 'LEAVE_DATES_OVERLAP');
    assert.doesNotMatch(body.error.message, /exclusion constraint/i, 'no raw postgres text');
  });

  // -------------------------------------------------------------------------
  test('5. two concurrent decides on the same step: one wins, one gets 409', async () => {
    const employee = await createEmployee({ opening: { PAID: '20.00' } });
    const hrOne = await createEmployee({ role: 'HR' });
    const hrTwo = await createEmployee({ role: 'HR' });

    // 1 day routes to a single HR step, so approving it completes the request.
    const { request, steps } = await applyForLeave(employee, { days: 1, weeksAhead: 4 });
    assert.equal(steps.length, 1);
    const stepId = steps[0].id;

    // Both approvers act on the same step at the same instant. FOR UPDATE serialises
    // them: the second blocks, then re-reads and finds the step already decided.
    const outcomes = await Promise.allSettled([
      approvalsService.decideStep(hrOne.actor, stepId, { action: 'APPROVE' }),
      approvalsService.decideStep(hrTwo.actor, stepId, { action: 'APPROVE' }),
    ]);

    const won = outcomes.filter((o) => o.status === 'fulfilled');
    const lost = outcomes.filter((o) => o.status === 'rejected');

    assert.equal(won.length, 1, 'exactly one decide may succeed');
    assert.equal(lost.length, 1, 'exactly one decide must fail');
    assert.equal(lost[0].reason.status, 409);
    assert.match(lost[0].reason.code, /STEP_ALREADY_DECIDED|REQUEST_ALREADY_DECIDED/);

    // The decisive assertion: the race produced ONE consumption, not two.
    const ledger = await ledgerRowsFor(request.id);
    assert.equal(ledger.length, 1, 'a race must not double-consume the balance');
    assert.equal(ledger[0].reason, 'CONSUMED');
    assert.equal(ledger[0].delta, `-${request.day_count}`);

    assert.equal((await requestStatus(request.id)).status, 'APPROVED');
    assert.equal(
      await balanceOf(employee.employeeId, 'PAID'),
      (20 - Number(request.day_count)).toFixed(2)
    );
  });
});
