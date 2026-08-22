import { ApiError } from '../ApiError.js';
import { store, nextId, requireActor, requireRole, paginate, money, idStr, emitStreamEvent } from './state.js';

function toWireQueueRow(step, request) {
  const employee = store.employees.find((e) => e.id === request.employeeId);
  return {
    step_id: idStr(step.id), request_id: idStr(request.id), step_no: step.stepNo,
    approver_role: step.approverRole, employee_id: idStr(request.employeeId),
    full_name: employee?.fullName ?? null, department_id: idStr(employee?.departmentId),
    leave_code: request.leaveCode, start_date: request.startDate, end_date: request.endDate,
    day_count: money(request.dayCount), remarks: request.remarks, created_at: request.createdAt,
  };
}

function toWireLedgerEntry(entry) {
  if (!entry) return null;
  return {
    id: idStr(entry.id), employee_id: idStr(entry.employeeId), leave_type_id: idStr(entry.leaveTypeId),
    delta: money(entry.delta), reason: entry.reason, ref_request_id: idStr(entry.refRequestId),
    created_at: entry.createdAt,
  };
}

export const approvalHandlers = [
  {
    method: 'GET', pattern: '/approvals/queue',
    handler: (_params, { query }) => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);
      let rows = store.leaveRequests
        .filter((r) => r.status === 'PENDING')
        .flatMap((r) => {
          const step = r.steps.find((s) => s.stepNo === r.currentStep && s.status === 'PENDING');
          return step && step.approverRole === actor.role ? [{ step, request: r }] : [];
        });
      if (query?.leaveCode) rows = rows.filter(({ request }) => request.leaveCode === query.leaveCode);
      const { data, page, pageSize, total } = paginate(rows, query?.page, query?.pageSize);
      return { data: data.map(({ step, request }) => toWireQueueRow(step, request)), page, pageSize, total };
    },
  },
  {
    // Wire shape (step/requestId/ledgerEntry/attendanceDays/skippedSteps/request/
    // employeeUserId/leaveCode) is from docs/api-shapes.md, including the real conflict
    // code — STEP_ALREADY_DECIDED, not the REQUEST_ALREADY_DECIDED this mock invented
    // before Sampurna's capture. The queue's toast text ("Someone else already decided
    // this request") stays a fixed UX string either way — only the code it matches changed.
    method: 'POST', pattern: '/approvals/steps/:stepId/decide',
    handler: ({ stepId }, { body }) => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);
      const { action, comment } = body ?? {};
      const request = store.leaveRequests.find((r) => r.steps.some((s) => s.id === Number(stepId)));
      if (!request) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      const step = request.steps.find((s) => s.id === Number(stepId));

      // §5.2 concurrency showpiece: the real backend does this with `SELECT ... FOR UPDATE`.
      // The mock has no lock, but the same check catches a double-decide from two tabs.
      if (request.status !== 'PENDING' || step.status !== 'PENDING' || request.currentStep !== step.stepNo) {
        const decider = request.steps.find((s) => s.status !== 'PENDING' && s.stepNo === step.stepNo);
        throw new ApiError(
          'STEP_ALREADY_DECIDED',
          `${decider?.approverName ?? 'Someone'} already ${(decider?.status ?? 'decided').toLowerCase()} this step.`,
          [{ field: 'stepId', issue: decider?.actedAt ? `Decided at ${decider.actedAt}` : undefined }],
          409,
        );
      }
      if (action === 'REJECT' && !comment) {
        throw new ApiError('VALIDATION_ERROR', 'Add a comment explaining the rejection.', [{ field: 'comment', issue: 'Required when rejecting.' }], 422);
      }

      step.approverUserId = actor.userId;
      step.approverName = actor.fullName;
      step.comment = comment ?? null;
      step.actedAt = new Date().toISOString();

      let ledgerEntry = null;
      let skippedSteps = 0;
      if (action === 'REJECT') {
        step.status = 'REJECTED';
        request.status = 'REJECTED';
        request.decidedAt = step.actedAt;
        request.steps.forEach((s) => {
          if (s.id !== step.id && s.status === 'PENDING') { s.status = 'SKIPPED'; skippedSteps += 1; }
        });
      } else {
        step.status = 'APPROVED';
        const isLastStep = request.currentStep === request.steps.length;
        if (isLastStep) {
          request.status = 'APPROVED';
          request.decidedAt = step.actedAt;
          const leaveType = store.leaveTypes.find((t) => t.id === request.leaveTypeId);
          if (leaveType?.isPaid) {
            const entry = {
              id: nextId('ledger'), employeeId: request.employeeId, leaveTypeId: request.leaveTypeId,
              delta: -request.dayCount, reason: 'CONSUMED', refRequestId: request.id, note: null,
              createdAt: step.actedAt,
            };
            store.leaveLedger.unshift(entry);
            const balance = store.leaveBalances.find((b) => b.employeeId === request.employeeId && b.leaveTypeId === request.leaveTypeId);
            if (balance) balance.balance -= request.dayCount;
            ledgerEntry = toWireLedgerEntry(entry);
          }
        } else {
          request.currentStep += 1;
        }
      }

      const employee = store.employees.find((e) => e.id === request.employeeId);
      if (employee) {
        store.notifications.unshift({
          id: nextId('notification'), userId: employee.userId,
          title: action === 'REJECT' ? 'Leave request rejected' : 'Leave request approved',
          body: `Your ${request.startDate} – ${request.endDate} ${request.leaveCode.toLowerCase()} leave was ${action === 'REJECT' ? 'rejected' : 'approved'} by ${actor.fullName}.`,
          link: '/leave/history', readAt: null, createdAt: step.actedAt,
        });
      }

      // docs/api-shapes.md's SSE payload for approval:decided — currentStep is null once
      // the request is terminal (APPROVED/REJECTED), consumed is null unless this decide
      // just wrote the CONSUMED row.
      emitStreamEvent('approval:decided', {
        requestId: idStr(request.id), stepNo: step.stepNo, action,
        decidedBy: idStr(actor.userId), requestStatus: request.status,
        currentStep: request.status === 'PENDING' ? request.currentStep : null,
        leaveCode: request.leaveCode, consumed: ledgerEntry ? ledgerEntry.delta : null,
      });

      return {
        step: {
          id: idStr(step.id), step_no: step.stepNo, status: step.status,
          approver_user_id: idStr(step.approverUserId), comment: step.comment, acted_at: step.actedAt,
        },
        requestId: idStr(request.id),
        ledgerEntry,
        attendanceDays: 0,
        skippedSteps,
        request: { id: idStr(request.id), status: request.status, current_step: request.currentStep },
        employeeUserId: idStr(employee?.userId ?? null),
        leaveCode: request.leaveCode,
      };
    },
  },
];
