/**
 * Business logic and transactions for leave. No req, no res, no SQL.
 */
import { pool, withTransaction } from '../../db/pool.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import {
  businessDaysBetween,
  compareDates,
  isSameCalendarYear,
  todayString,
} from '../../lib/dates.js';
import * as q from './leave.queries.js';

const PRIVILEGED_ROLES = new Set(['HR', 'ADMIN']);

const isPrivileged = (actor) => PRIVILEGED_ROLES.has(actor.role);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Decides whose data the caller may read.
 *
 * Denials are 404 rather than 403, so an employee probing /leave/balances?employeeId=7
 * cannot tell a colleague's id from one that does not exist (§8).
 */
function resolveEmployeeId(actor, requestedEmployeeId) {
  if (requestedEmployeeId == null) {
    if (!actor.employeeId) {
      throw notFound('EMPLOYEE_NOT_FOUND', 'This account has no employee record.');
    }
    return actor.employeeId;
  }
  if (sameId(requestedEmployeeId, actor.employeeId) || isPrivileged(actor)) {
    return requestedEmployeeId;
  }
  throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
}

export function listLeaveTypes() {
  return q.listActiveLeaveTypes(pool);
}

export async function getBalances(actor, { employeeId } = {}) {
  const target = resolveEmployeeId(actor, employeeId);
  const balances = await q.getBalances(pool, { employeeId: target });
  return { employeeId: String(target), balances };
}

export async function getLedger(actor, { employeeId, typeId } = {}) {
  const target = resolveEmployeeId(actor, employeeId);
  const entries = await q.getLedgerTape(pool, { employeeId: target, leaveTypeId: typeId });
  return { employeeId: String(target), entries };
}

/**
 * §5.1, in order, as one transaction.
 *
 * Everything below the INSERT is part of the same unit: a request that exists without
 * its approval steps could never be decided, and one whose steps exist without the
 * request would corrupt the queue. Either the whole application lands or none of it does.
 */
export async function createLeaveRequest(actor, { leaveTypeId, startDate, endDate, remarks }) {
  if (!actor.employeeId) {
    throw notFound('EMPLOYEE_NOT_FOUND', 'This account has no employee record.');
  }

  const created = await withTransaction(async (client) => {
    const leaveType = await q.getLeaveTypeById(client, { leaveTypeId });
    if (!leaveType || !leaveType.is_active) {
      throw unprocessable('LEAVE_TYPE_NOT_FOUND', 'That leave type is not available.', [
        { field: 'leaveTypeId', issue: 'Not an active leave type' },
      ]);
    }

    // --- step 1: date rules -------------------------------------------------
    if (compareDates(endDate, startDate) < 0) {
      throw unprocessable('LEAVE_END_BEFORE_START', 'The end date is before the start date.', [
        { field: 'endDate', issue: `Must be on or after ${startDate}` },
      ]);
    }
    const today = todayString();
    if (compareDates(startDate, today) < 0) {
      throw unprocessable('LEAVE_START_IN_PAST', 'You cannot apply for leave that has already started.', [
        { field: 'startDate', issue: `Must be ${today} or later` },
      ]);
    }
    if (!isSameCalendarYear(startDate, endDate)) {
      throw unprocessable(
        'LEAVE_SPANS_CALENDAR_YEARS',
        'A leave request must start and end in the same calendar year.',
        [{ field: 'endDate', issue: `Must be on or before ${startDate.slice(0, 4)}-12-31` }]
      );
    }

    // --- step 2: working days ----------------------------------------------
    const holidays = await q.getHolidaysBetween(client, { start: startDate, end: endDate });
    const dayCount = businessDaysBetween(
      startDate,
      endDate,
      holidays.map((h) => h.holiday_date)
    );

    if (dayCount === 0) {
      throw unprocessable(
        'LEAVE_NO_WORKING_DAYS',
        'That range contains no working days - it is entirely weekends and public holidays.',
        [{ field: 'startDate', issue: 'Pick a range that includes at least one working day' }]
      );
    }

    // --- step 3: balance, paid types only -----------------------------------
    if (leaveType.is_paid) {
      const balance = await q.getBalanceForType(client, {
        employeeId: actor.employeeId,
        leaveTypeId,
        required: dayCount,
      });

      if (!balance || !balance.sufficient) {
        const available = balance?.balance ?? '0.00';
        throw unprocessable(
          'INSUFFICIENT_BALANCE',
          `You have ${available} ${leaveType.name.toLowerCase()} days available but requested ${dayCount}.`,
          [
            {
              field: 'endDate',
              issue: `Reduce the range by ${(dayCount - Number(available)).toFixed(2)} days`,
            },
          ]
        );
      }
    }

    // --- step 4: the request. 23P01 from the EXCLUDE constraint becomes 409. --
    const request = await q.insertLeaveRequest(client, {
      employeeId: actor.employeeId,
      leaveTypeId,
      startDate,
      endDate,
      dayCount,
      remarks,
    });

    // --- step 5: routing, read from the database ----------------------------
    const rules = await q.getApprovalChainRules(client, { leaveTypeId, dayCount });

    if (rules.length === 0) {
      // approval_chain_rules is misconfigured and has left a gap. Refusing here beats
      // committing a request that has no steps and could therefore never be decided.
      throw unprocessable(
        'NO_APPROVAL_CHAIN',
        'No approval route is configured for a request of that length. Contact your administrator.'
      );
    }

    const steps = await q.insertApprovalSteps(client, {
      requestId: request.id,
      stepNos: rules.map((r) => r.step_no),
      approverRoles: rules.map((r) => r.approver_role),
    });

    // --- step 6: tell the people who have to act ----------------------------
    // Only the role that acts first is notified. Telling step 2's approvers now would
    // put work in their queue that they cannot action until step 1 clears.
    const firstStepRole = rules[0].approver_role;
    const applicantName = await q.getEmployeeName(client, { employeeId: actor.employeeId });

    await q.notifyApproverRoles(client, {
      roles: [firstStepRole],
      title: 'Leave request awaiting your approval',
      body: `${applicantName ?? 'An employee'} requested ${dayCount} day(s) of ${leaveType.name} from ${startDate} to ${endDate}.`,
      link: `/admin/approvals?request=${request.id}`,
    });

    return { request, steps, dayCount, leaveType };
  });

  /*
   * The SSE broadcast of 'approval:new' belongs here, immediately after COMMIT and
   * never inside the transaction - a subscriber told about a request that then rolled
   * back would be looking at something that never existed. realtime/sse.js arrives in
   * STEP 4; this is the call site.
   */

  return created;
}

export async function listRequests(actor, { scope, status, employeeId, page, pageSize }) {
  // 'all' is a privilege, not a preference: anyone else silently gets their own list.
  const wantsAll = scope === 'all' && isPrivileged(actor);

  let target = null;
  if (!wantsAll) {
    target = resolveEmployeeId(actor, employeeId);
  } else if (employeeId != null) {
    target = employeeId; // HR/ADMIN narrowing the full list to one person
  }

  const rows = await q.listLeaveRequests(pool, {
    employeeId: target,
    status,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const total = rows.length > 0 ? rows[0].total_count : 0;
  return {
    data: rows.map(({ total_count, ...row }) => row),
    page,
    pageSize,
    total,
  };
}

export async function getRequestDetail(actor, requestId) {
  const request = await q.getLeaveRequestById(pool, { requestId });

  // Missing and not-yours are the same answer, so neither confirms the other (§8).
  if (!request || (!isPrivileged(actor) && !sameId(request.employee_id, actor.employeeId))) {
    throw notFound('LEAVE_REQUEST_NOT_FOUND', 'No leave request with that id.');
  }

  const timeline = await q.getApprovalTimeline(pool, { requestId });
  return { request, timeline };
}

/**
 * Cancellation.
 *
 * An already-approved request is undone by inserting a compensating REVERSAL row, not
 * by deleting the CONSUMED one (§1.2). Both rows stay on the tape, so the balance is
 * explained by its history rather than merely asserted - that is the whole design.
 */
export async function cancelRequest(actor, requestId) {
  return withTransaction(async (client) => {
    const request = await q.lockLeaveRequestForUpdate(client, { requestId });

    if (!request || !sameId(request.employee_id, actor.employeeId)) {
      // Only the owner may cancel (§6). Non-owners get the same 404 as a stranger id.
      throw notFound('LEAVE_REQUEST_NOT_FOUND', 'No leave request with that id.');
    }

    if (request.status === 'CANCELLED') {
      throw conflict('LEAVE_ALREADY_CANCELLED', 'That request is already cancelled.');
    }
    if (request.status === 'REJECTED') {
      throw conflict('LEAVE_ALREADY_REJECTED', 'That request was rejected and cannot be cancelled.');
    }

    // Only an APPROVED request ever moved the ledger, so only that one needs undoing.
    let reversal = null;
    if (request.status === 'APPROVED' && request.is_paid) {
      reversal = await q.insertLedgerRow(client, {
        employeeId: request.employee_id,
        leaveTypeId: request.leave_type_id,
        delta: request.day_count, // positive: giving the days back
        reason: 'REVERSAL',
        refRequestId: request.id,
        note: `Cancellation of approved leave ${request.start_date} to ${request.end_date}`,
        createdBy: actor.id,
      });
    }

    const skipped = await q.skipPendingSteps(client, { requestId });
    const updated = await q.updateRequestStatus(client, { requestId, status: 'CANCELLED' });

    /*
     * An approved request also wrote ON_LEAVE rows into attendance_days (§5.2). Those
     * are derived state and are rebuilt from punches, leaves and holidays by
     * POST /attendance/recompute, so cancellation does not need to unpick them by hand.
     * The attendance module lands in STEP 4.
     */

    return { request: updated, reversal, skippedSteps: skipped.length };
  });
}
