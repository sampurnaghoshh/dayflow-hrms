import { ApiError } from '../ApiError.js';
import {
  store, nextId, requireActor, requireRole, requireSelfOrRole,
  businessDaysBetween, balanceFor, paginate, money, idStr, emitStreamEvent,
} from './state.js';

// Internal store rows stay plain numbers/camelCase for easy business-logic math (balance
// checks, day counts). These convert to the exact wire shape docs/api-shapes.md captured —
// snake_case row fields, stringified NUMERIC/BIGINT values — only at the point a handler
// returns data, the same way a real service layer would serialize a `pg` row.
function toWireLeaveType(t) {
  return {
    id: idStr(t.id), code: t.code, name: t.name, is_paid: t.isPaid,
    accrual_per_month: money(t.accrualPerMonth),
    annual_cap: t.annualCap === null ? null : money(t.annualCap),
    carry_forward_cap: money(t.carryForwardCap),
    requires_document: t.requiresDocument,
  };
}

function toWireBalance(b) {
  return {
    leave_type_id: idStr(b.leaveTypeId), leave_code: b.leaveCode, leave_name: b.leaveName,
    balance: money(b.balance), total_accrued: money(b.totalAccrued), total_consumed: money(b.totalConsumed),
  };
}

function employeeName(employeeId) {
  return store.employees.find((e) => e.id === employeeId)?.fullName ?? null;
}
function leaveType(leaveTypeId) {
  return store.leaveTypes.find((t) => t.id === leaveTypeId);
}

function toWireRequestRow(r) {
  const lt = leaveType(r.leaveTypeId);
  return {
    id: idStr(r.id), employee_id: idStr(r.employeeId), full_name: employeeName(r.employeeId),
    leave_type_id: idStr(r.leaveTypeId), leave_code: r.leaveCode, leave_name: lt?.name ?? null,
    start_date: r.startDate, end_date: r.endDate, day_count: money(r.dayCount),
    remarks: r.remarks, status: r.status, current_step: r.currentStep,
    created_at: r.createdAt, decided_at: r.decidedAt,
  };
}

function toWireRequestDetail(r) {
  const lt = leaveType(r.leaveTypeId);
  const employee = store.employees.find((e) => e.id === r.employeeId);
  return {
    ...toWireRequestRow(r),
    department_id: idStr(employee?.departmentId), is_paid: !!lt?.isPaid,
  };
}

function toWireTimelineStep(s) {
  return {
    step_id: idStr(s.id), step_no: s.stepNo, approver_role: s.approverRole, status: s.status,
    comment: s.comment, acted_at: s.actedAt, approver_user_id: idStr(s.approverUserId ?? null),
    approver_name: s.approverName,
  };
}

function requestSteps(dayCount) {
  // Mock stand-in for approval_chain_rules (§5.1 step 5) — real routing lives in the DB, not here.
  return dayCount > 2
    ? [
        { id: nextId('step'), stepNo: 1, approverRole: 'HR', approverUserId: null, approverName: null, status: 'PENDING', comment: null, actedAt: null },
        { id: nextId('step'), stepNo: 2, approverRole: 'ADMIN', approverUserId: null, approverName: null, status: 'PENDING', comment: null, actedAt: null },
      ]
    : [{ id: nextId('step'), stepNo: 1, approverRole: 'HR', approverUserId: null, approverName: null, status: 'PENDING', comment: null, actedAt: null }];
}

export const leaveHandlers = [
  {
    // Bare array, not { data: [...] } — GET /leave/types isn't a paginated list.
    method: 'GET', pattern: '/leave/types',
    handler: () => store.leaveTypes.filter((t) => t.isActive).map(toWireLeaveType),
  },
  {
    method: 'GET', pattern: '/leave/balances',
    handler: (_params, { query }) => {
      const actor = requireActor();
      const employeeId = Number(query?.employeeId ?? actor.id);
      requireSelfOrRole(actor, employeeId, ['HR', 'ADMIN']);
      return {
        employeeId: idStr(employeeId),
        balances: store.leaveBalances.filter((b) => b.employeeId === employeeId).map(toWireBalance),
      };
    },
  },
  {
    // Not in docs/api-shapes.md — extrapolated from the same conventions (snake_case rows,
    // computed running balance). Flag to Sampurna if the real shape differs.
    method: 'GET', pattern: '/leave/ledger',
    handler: (_params, { query }) => {
      const actor = requireActor();
      const employeeId = Number(query?.employeeId ?? actor.id);
      requireSelfOrRole(actor, employeeId, ['HR', 'ADMIN']);
      let rows = store.leaveLedger.filter((l) => l.employeeId === employeeId);
      if (query?.typeId) rows = rows.filter((l) => l.leaveTypeId === Number(query.typeId));
      const chronological = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      let running = 0;
      const withRunning = chronological.map((l) => {
        running += l.delta;
        return { ...l, runningBalance: running };
      });
      return {
        data: withRunning.reverse().map((l) => ({
          id: idStr(l.id), employee_id: idStr(l.employeeId), leave_type_id: idStr(l.leaveTypeId),
          delta: money(l.delta), reason: l.reason, ref_request_id: idStr(l.refRequestId),
          note: l.note, created_at: l.createdAt, running_balance: money(l.runningBalance),
        })),
      };
    },
  },
  {
    method: 'POST', pattern: '/leave/requests',
    handler: (_params, { body }) => {
      const actor = requireActor();
      requireRole(actor, ['EMPLOYEE']);
      const { leaveTypeId, startDate, endDate, remarks } = body ?? {};
      const lt = store.leaveTypes.find((t) => t.id === Number(leaveTypeId));
      if (!lt) throw new ApiError('VALIDATION_ERROR', 'Choose a leave type.', [{ field: 'leaveTypeId', issue: 'Required.' }], 400);
      const today = new Date().toISOString().slice(0, 10);
      if (!startDate || !endDate || endDate < startDate) {
        throw new ApiError('VALIDATION_ERROR', 'Choose a valid date range.', [{ field: 'endDate', issue: 'End date must be on or after the start date.' }], 400);
      }
      if (startDate < today) {
        throw new ApiError('VALIDATION_ERROR', "You can't apply for leave in the past.", [{ field: 'startDate', issue: 'Choose today or a later date.' }], 400);
      }
      if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
        throw new ApiError('VALIDATION_ERROR', 'Leave requests must stay within a single calendar year.', [{ field: 'endDate', issue: 'Split this into two requests.' }], 400);
      }
      const dayCount = businessDaysBetween(startDate, endDate);
      if (dayCount === 0) {
        throw new ApiError('LEAVE_NO_WORKING_DAYS', 'That range has no working days — every day falls on a weekend or holiday.', [], 422);
      }
      if (lt.isPaid) {
        const available = balanceFor(actor.id, lt.id);
        if (available < dayCount) {
          throw new ApiError('INSUFFICIENT_BALANCE', `You have ${available} ${lt.name.toLowerCase()} days available but requested ${dayCount}.`, [{ field: 'endDate', issue: `Reduce the range by ${dayCount - available} days.` }], 422);
        }
      }
      const overlap = store.leaveRequests.some((r) => r.employeeId === actor.id && ['PENDING', 'APPROVED'].includes(r.status) && !(endDate < r.startDate || startDate > r.endDate));
      if (overlap) throw new ApiError('OVERLAPPING_LEAVE', 'You already have a leave request covering some of these dates.', [], 409);

      const request = {
        id: nextId('leaveRequest'), employeeId: actor.id,
        leaveTypeId: lt.id, leaveCode: lt.code,
        startDate, endDate, dayCount, remarks: remarks ?? null,
        status: 'PENDING', currentStep: 1, createdAt: new Date().toISOString(), decidedAt: null,
        steps: requestSteps(dayCount),
      };
      store.leaveRequests.unshift(request);
      const approvers = store.employees.filter((e) => e.role === request.steps[0].approverRole);
      approvers.forEach((a) => store.notifications.unshift({
        id: nextId('notification'), userId: a.userId, title: 'New leave request',
        body: `${actor.fullName} requested ${dayCount} day(s) of ${lt.name.toLowerCase()}.`,
        link: '/admin/approvals', readAt: null, createdAt: new Date().toISOString(),
      }));
      // §5.1: "then: SSE broadcast 'approval:new'" — payload shape from docs/api-shapes.md.
      emitStreamEvent('approval:new', {
        requestId: idStr(request.id), employeeId: idStr(request.employeeId), leaveCode: request.leaveCode,
        startDate: request.startDate, endDate: request.endDate, dayCount: money(request.dayCount),
        approverRole: request.steps[0].approverRole,
      });
      return {
        request: toWireRequestRow(request),
        approvalSteps: request.steps.map((s) => ({ id: idStr(s.id), step_no: s.stepNo, approver_role: s.approverRole, status: s.status })),
        dayCount,
      };
    },
  },
  {
    method: 'GET', pattern: '/leave/requests',
    handler: (_params, { query }) => {
      const actor = requireActor();
      const canSeeAll = query?.scope === 'all' && ['HR', 'ADMIN'].includes(actor.role);
      let rows = canSeeAll ? store.leaveRequests : store.leaveRequests.filter((r) => r.employeeId === actor.id);
      if (canSeeAll && query?.employeeId) rows = rows.filter((r) => r.employeeId === Number(query.employeeId));
      if (query?.status) rows = rows.filter((r) => r.status === query.status);
      const { data, page, pageSize, total } = paginate(rows, query?.page, query?.pageSize);
      return { data: data.map(toWireRequestRow), page, pageSize, total };
    },
  },
  {
    // { request, timeline } — the list above is deliberately lighter than this; a screen
    // that wants the approval steps has to fetch this per request.
    method: 'GET', pattern: '/leave/requests/:id',
    handler: ({ id }) => {
      const actor = requireActor();
      const request = store.leaveRequests.find((r) => r.id === Number(id));
      if (!request) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      requireSelfOrRole(actor, request.employeeId, ['HR', 'ADMIN']);
      return { request: toWireRequestDetail(request), timeline: request.steps.map(toWireTimelineStep) };
    },
  },
  {
    // Not in docs/api-shapes.md — extrapolated to mirror the decide endpoint's shape.
    method: 'POST', pattern: '/leave/requests/:id/cancel',
    handler: ({ id }) => {
      const actor = requireActor();
      const request = store.leaveRequests.find((r) => r.id === Number(id));
      if (!request) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      if (request.employeeId !== actor.id) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      if (!['PENDING', 'APPROVED'].includes(request.status)) {
        throw new ApiError('REQUEST_NOT_CANCELLABLE', 'This request can no longer be cancelled.', [], 409);
      }
      let ledgerEntry = null;
      if (request.status === 'APPROVED' && store.leaveTypes.find((t) => t.id === request.leaveTypeId)?.isPaid) {
        const entry = {
          id: nextId('ledger'), employeeId: request.employeeId, leaveTypeId: request.leaveTypeId,
          delta: request.dayCount, reason: 'REVERSAL', refRequestId: request.id, note: 'Cancelled by employee',
          createdAt: new Date().toISOString(),
        };
        store.leaveLedger.unshift(entry);
        const balance = store.leaveBalances.find((b) => b.employeeId === request.employeeId && b.leaveTypeId === request.leaveTypeId);
        if (balance) balance.balance += request.dayCount;
        ledgerEntry = {
          id: idStr(entry.id), employee_id: idStr(entry.employeeId), leave_type_id: idStr(entry.leaveTypeId),
          delta: money(entry.delta), reason: entry.reason, ref_request_id: idStr(entry.refRequestId), created_at: entry.createdAt,
        };
      }
      request.status = 'CANCELLED';
      request.steps.forEach((s) => { if (s.status === 'PENDING') s.status = 'SKIPPED'; });
      return { request: { id: idStr(request.id), status: request.status }, ledgerEntry };
    },
  },
];
