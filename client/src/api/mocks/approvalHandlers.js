import { ApiError } from '../ApiError.js';
import { store, nextId, requireActor, requireRole } from './state.js';

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
          return step && step.approverRole === actor.role
            ? [{ stepId: step.id, requestId: r.id, stepNo: step.stepNo, approverRole: step.approverRole,
                employeeId: r.employeeId, employeeName: r.employeeName, leaveCode: r.leaveCode,
                startDate: r.startDate, endDate: r.endDate, dayCount: r.dayCount, remarks: r.remarks, createdAt: r.createdAt }]
            : [];
        });
      if (query?.leaveCode) rows = rows.filter((r) => r.leaveCode === query.leaveCode);
      return { data: rows };
    },
  },
  {
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
        throw new ApiError('REQUEST_ALREADY_DECIDED', 'Someone else already decided this request.', [], 409);
      }
      if (action === 'REJECT' && !comment) {
        throw new ApiError('VALIDATION_ERROR', 'Add a comment explaining the rejection.', [{ field: 'comment', issue: 'Required when rejecting.' }], 422);
      }

      step.approverName = actor.fullName;
      step.comment = comment ?? null;
      step.actedAt = new Date().toISOString();

      if (action === 'REJECT') {
        step.status = 'REJECTED';
        request.status = 'REJECTED';
        request.decidedAt = step.actedAt;
      } else {
        step.status = 'APPROVED';
        const isLastStep = request.currentStep === request.steps.length;
        if (isLastStep) {
          request.status = 'APPROVED';
          request.decidedAt = step.actedAt;
          const leaveType = store.leaveTypes.find((t) => t.id === request.leaveTypeId);
          if (leaveType?.isPaid) {
            store.leaveLedger.unshift({
              id: nextId('ledger'), employeeId: request.employeeId, leaveTypeId: request.leaveTypeId,
              delta: -request.dayCount, reason: 'CONSUMED', refRequestId: request.id, note: null,
              createdAt: step.actedAt, runningBalance: null,
            });
            const balance = store.leaveBalances.find((b) => b.employeeId === request.employeeId && b.leaveTypeId === request.leaveTypeId);
            if (balance) balance.balance -= request.dayCount;
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
      return request;
    },
  },
];
