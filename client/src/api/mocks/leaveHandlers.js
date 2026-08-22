import { ApiError } from '../ApiError.js';
import {
  store, nextId, requireActor, requireRole, requireSelfOrRole,
  businessDaysBetween, balanceFor,
} from './state.js';

function requestSteps(dayCount) {
  // Mock stand-in for approval_chain_rules (§5.1 step 5) — real routing lives in the DB, not here.
  return dayCount > 2
    ? [
        { id: nextId('step'), stepNo: 1, approverRole: 'HR', approverName: null, status: 'PENDING', comment: null, actedAt: null },
        { id: nextId('step'), stepNo: 2, approverRole: 'ADMIN', approverName: null, status: 'PENDING', comment: null, actedAt: null },
      ]
    : [{ id: nextId('step'), stepNo: 1, approverRole: 'HR', approverName: null, status: 'PENDING', comment: null, actedAt: null }];
}

export const leaveHandlers = [
  {
    method: 'GET', pattern: '/leave/types',
    handler: () => ({ data: store.leaveTypes.filter((t) => t.isActive) }),
  },
  {
    method: 'GET', pattern: '/leave/balances',
    handler: (_params, { query }) => {
      const actor = requireActor();
      const employeeId = Number(query?.employeeId ?? actor.id);
      requireSelfOrRole(actor, employeeId, ['HR', 'ADMIN']);
      return { data: store.leaveBalances.filter((b) => b.employeeId === employeeId) };
    },
  },
  {
    method: 'GET', pattern: '/leave/ledger',
    handler: (_params, { query }) => {
      const actor = requireActor();
      const employeeId = Number(query?.employeeId ?? actor.id);
      requireSelfOrRole(actor, employeeId, ['HR', 'ADMIN']);
      let rows = store.leaveLedger.filter((l) => l.employeeId === employeeId);
      if (query?.typeId) rows = rows.filter((l) => l.leaveTypeId === Number(query.typeId));
      return { data: rows };
    },
  },
  {
    method: 'POST', pattern: '/leave/requests',
    handler: (_params, { body }) => {
      const actor = requireActor();
      requireRole(actor, ['EMPLOYEE']);
      const { leaveTypeId, startDate, endDate, remarks } = body ?? {};
      const leaveType = store.leaveTypes.find((t) => t.id === Number(leaveTypeId));
      if (!leaveType) throw new ApiError('VALIDATION_ERROR', 'Choose a leave type.', [{ field: 'leaveTypeId', issue: 'Required.' }], 400);
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
      if (leaveType.isPaid) {
        const available = balanceFor(actor.id, leaveType.id);
        if (available < dayCount) {
          throw new ApiError('INSUFFICIENT_BALANCE', `You have ${available} ${leaveType.name.toLowerCase()} days available but requested ${dayCount}.`, [{ field: 'endDate', issue: `Reduce the range by ${dayCount - available} days.` }], 422);
        }
      }
      const overlap = store.leaveRequests.some((r) => r.employeeId === actor.id && ['PENDING', 'APPROVED'].includes(r.status) && !(endDate < r.startDate || startDate > r.endDate));
      if (overlap) throw new ApiError('OVERLAPPING_LEAVE', 'You already have a leave request covering some of these dates.', [], 409);

      const request = {
        id: nextId('leaveRequest'), employeeId: actor.id, employeeName: actor.fullName,
        leaveTypeId: leaveType.id, leaveCode: leaveType.code,
        startDate, endDate, dayCount, remarks: remarks ?? null,
        status: 'PENDING', currentStep: 1, createdAt: new Date().toISOString(), decidedAt: null,
        steps: requestSteps(dayCount),
      };
      store.leaveRequests.unshift(request);
      const approvers = store.employees.filter((e) => e.role === request.steps[0].approverRole);
      approvers.forEach((a) => store.notifications.unshift({
        id: nextId('notification'), userId: a.userId, title: 'New leave request',
        body: `${actor.fullName} requested ${dayCount} day(s) of ${leaveType.name.toLowerCase()}.`,
        link: '/admin/approvals', readAt: null, createdAt: new Date().toISOString(),
      }));
      return request;
    },
  },
  {
    method: 'GET', pattern: '/leave/requests',
    handler: (_params, { query }) => {
      const actor = requireActor();
      const canSeeAll = query?.scope === 'all' && ['HR', 'ADMIN'].includes(actor.role);
      const rows = canSeeAll ? store.leaveRequests : store.leaveRequests.filter((r) => r.employeeId === actor.id);
      return { data: rows };
    },
  },
  {
    method: 'GET', pattern: '/leave/requests/:id',
    handler: ({ id }) => {
      const actor = requireActor();
      const request = store.leaveRequests.find((r) => r.id === Number(id));
      if (!request) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      requireSelfOrRole(actor, request.employeeId, ['HR', 'ADMIN']);
      return request;
    },
  },
  {
    method: 'POST', pattern: '/leave/requests/:id/cancel',
    handler: ({ id }) => {
      const actor = requireActor();
      const request = store.leaveRequests.find((r) => r.id === Number(id));
      if (!request) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      if (request.employeeId !== actor.id) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      if (!['PENDING', 'APPROVED'].includes(request.status)) {
        throw new ApiError('REQUEST_NOT_CANCELLABLE', 'This request can no longer be cancelled.', [], 409);
      }
      if (request.status === 'APPROVED' && store.leaveTypes.find((t) => t.id === request.leaveTypeId)?.isPaid) {
        store.leaveLedger.unshift({
          id: nextId('ledger'), employeeId: request.employeeId, leaveTypeId: request.leaveTypeId,
          delta: request.dayCount, reason: 'REVERSAL', refRequestId: request.id, note: 'Cancelled by employee',
          createdAt: new Date().toISOString(), runningBalance: null,
        });
        const balance = store.leaveBalances.find((b) => b.employeeId === request.employeeId && b.leaveTypeId === request.leaveTypeId);
        if (balance) balance.balance += request.dayCount;
      }
      request.status = 'CANCELLED';
      request.steps.forEach((s) => { if (s.status === 'PENDING') s.status = 'SKIPPED'; });
      return request;
    },
  },
];
