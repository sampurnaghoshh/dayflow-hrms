/**
 * The approval engine. Business logic and transactions only - no req, no res, no SQL.
 *
 * CLAUDE.md §5.2 is implemented here in full: lock the request, re-read the step under
 * that lock, refuse every way the world may have moved since the approver loaded their
 * queue, and only then write.
 */
import { pool, withTransaction } from '../../db/pool.js';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { eachDateInRange, isWeekend } from '../../lib/dates.js';
import { broadcast } from '../../realtime/sse.js';
import * as q from './approvals.queries.js';
import * as leaveQ from '../leave/leave.queries.js';

/**
 * Which approver_role values each role may act on.
 *
 * ADMIN can decide a step routed to HR; HR cannot decide a step routed to ADMIN.
 *
 * The two-step chain exists to collect two sign-offs, not to make the roles disjoint,
 * and there is no capability in this system that HR holds and ADMIN does not - so a
 * strict equality check would only mean an admin staring at a queue they are plainly
 * senior enough to clear. It also removes a demo trap: with step 1 routed to HR and the
 * demo account an ADMIN, a strict check makes a correctly-working engine look broken.
 *
 * requireRole() keeps no implicit hierarchy because route access is a coarse gate.
 * This is the finer question of who may act on a particular step, and it gets its own
 * answer. The separation of duties that the chain is actually for is preserved by
 * ONE_DECISION_PER_APPROVER below, not by role equality.
 */
const ROLE_AUTHORITY = {
  ADMIN: new Set(['ADMIN', 'HR']),
  HR: new Set(['HR']),
  EMPLOYEE: new Set(),
};

/**
 * No single person may sign off two steps of the same request.
 *
 * Without this, letting ADMIN act on HR steps would quietly collapse the HR -> ADMIN
 * chain into one signature, which is the exact thing a two-step chain is for. Nothing in
 * CLAUDE.md asks for this rule; it is here because allowing the role overlap above
 * without it would weaken the design. Flip it off and the overlap becomes a real hole.
 */
const ONE_DECISION_PER_APPROVER = true;

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const canActOn = (actorRole, stepRole) => (ROLE_AUTHORITY[actorRole] ?? new Set()).has(stepRole);

/** GET /approvals/queue - only steps this caller could actually decide. */
export async function getQueue(actor, { page, pageSize }) {
  const roles = [...(ROLE_AUTHORITY[actor.role] ?? [])];
  if (roles.length === 0) {
    throw forbidden('INSUFFICIENT_ROLE', 'You do not have permission to do that.');
  }

  const rows = await q.listQueue(pool, {
    roles,
    excludeEmployeeId: actor.employeeId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const total = rows.length > 0 ? rows[0].total_count : 0;
  return { data: rows.map(({ total_count, ...row }) => row), page, pageSize, total };
}

/** Turns a prior decision row into a sentence that names a person and a time. */
function describeDecision(prior) {
  if (!prior) return null;
  const who = prior.approver_name ?? prior.approver_email ?? 'another approver';
  const verb = prior.status === 'APPROVED' ? 'approved' : 'rejected';
  const when = prior.acted_at ? new Date(prior.acted_at).toISOString() : null;
  return { who, verb, when, stepNo: prior.step_no };
}

/**
 * POST /approvals/steps/:stepId/decide
 *
 * @param {{id: string, role: string, employeeId: string|null}} actor
 * @param {number|string} stepId
 * @param {{action: 'APPROVE'|'REJECT', comment?: string}} decision
 */
export async function decideStep(actor, stepId, { action, comment }) {
  const outcome = await withTransaction(async (client) => {
    // --- §5.2's lock. Everything after this is serialised per request. ----------
    const ctx = await q.lockRequestByStepId(client, { stepId });
    if (!ctx) {
      throw notFound('APPROVAL_STEP_NOT_FOUND', 'No approval step with that id.');
    }

    // Re-read the step now that the lock is held, in its own statement, so a decision
    // committed while we were queued is visible rather than hidden by our old snapshot.
    const step = await q.lockStep(client, { stepId });
    if (!step) {
      throw notFound('APPROVAL_STEP_NOT_FOUND', 'No approval step with that id.');
    }

    // --- who may act -----------------------------------------------------------
    if (!canActOn(actor.role, step.approver_role)) {
      throw forbidden(
        'INSUFFICIENT_ROLE',
        `This step is routed to ${step.approver_role} and you are signed in as ${actor.role}.`
      );
    }

    // An approver deciding their own leave is the classic control failure, and it is a
    // live scenario here because HR and ADMIN file leave through the same endpoint as
    // everyone else. 422 rather than 403: the role is right, the business rule says no.
    if (sameId(ctx.employee_id, actor.employeeId)) {
      throw unprocessable(
        'SELF_APPROVAL_FORBIDDEN',
        'You cannot decide your own leave request. Ask another approver to review it.'
      );
    }

    // --- the three ways the world may have moved, each answered separately ------

    // 1. This step has already been acted on.
    if (step.step_status !== 'PENDING') {
      if (step.step_status === 'SKIPPED') {
        throw conflict(
          'STEP_SUPERSEDED',
          'That step was closed because the request was already decided at another step.'
        );
      }
      // Name whoever decided THIS step. The latest decision on the request may belong
      // to a different, later step and would put the wrong person's name in the message.
      const who = step.approver_name ?? step.approver_email ?? 'Another approver';
      const verb = step.step_status === 'APPROVED' ? 'approved' : 'rejected';
      const when = step.acted_at ? new Date(step.acted_at).toISOString() : null;
      throw conflict(
        'STEP_ALREADY_DECIDED',
        `${who} already ${verb} this step.`,
        when ? [{ field: 'stepId', issue: `${who} ${verb} it at ${when}` }] : undefined
      );
    }

    // 2. The request as a whole is finished - rejected, cancelled or fully approved.
    if (ctx.request_status !== 'PENDING') {
      const prior = describeDecision(await q.findLatestDecision(client, { requestId: ctx.request_id }));
      const tail =
        ctx.request_status === 'CANCELLED'
          ? 'The employee cancelled it.'
          : prior
            ? `${prior.who} already ${prior.verb} it.`
            : '';
      throw conflict(
        'REQUEST_ALREADY_DECIDED',
        `That request is already ${ctx.request_status.toLowerCase()}. ${tail}`.trim(),
        prior && ctx.request_status !== 'CANCELLED'
          ? [{ field: 'stepId', issue: `${prior.who} ${prior.verb} it at ${prior.when}` }]
          : undefined
      );
    }

    // 3. The request has moved past this step, or has not reached it yet.
    if (Number(step.step_no) !== Number(ctx.current_step)) {
      throw conflict(
        'STEP_SUPERSEDED',
        Number(step.step_no) < Number(ctx.current_step)
          ? 'That step has already been passed - the request has moved to a later approver.'
          : 'That step is not open yet - an earlier approver has to act first.',
        [{ field: 'stepId', issue: `Request is currently at step ${ctx.current_step}` }]
      );
    }

    // --- separation of duties ---------------------------------------------------
    if (ONE_DECISION_PER_APPROVER) {
      const own = await q.findUserDecisionOnRequest(client, {
        requestId: ctx.request_id,
        userId: actor.id,
        excludeStepId: stepId,
      });
      if (own) {
        throw unprocessable(
          'DISTINCT_APPROVER_REQUIRED',
          `You already decided step ${own.step_no} of this request. A second approver has to sign off this one.`
        );
      }
    }

    // --- the decision -----------------------------------------------------------
    const decidedStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const decided = await q.markStepDecided(client, {
      stepId,
      status: decidedStatus,
      approverUserId: actor.id,
      comment,
    });

    // The UPDATE is guarded by status = 'PENDING'. Matching nothing means somebody
    // decided this step while we held the lock, which should be impossible - treat it
    // as a conflict rather than reporting a success that did not happen.
    if (!decided) {
      throw conflict('STEP_ALREADY_DECIDED', 'That step was decided by someone else just now.');
    }

    const isLastStep = Number(step.step_no) === Number(ctx.max_step_no);
    const result = {
      step: decided,
      requestId: ctx.request_id,
      ledgerEntry: null,
      attendanceDays: 0,
      skippedSteps: 0,
    };

    if (action === 'REJECT') {
      // Terminal, and it moves no balance at all: nothing was ever consumed, so there
      // is nothing to consume or to give back. Zero ledger rows (§12 test 3).
      result.skippedSteps = (await leaveQ.skipPendingSteps(client, { requestId: ctx.request_id })).length;
      const updated = await leaveQ.updateRequestStatus(client, {
        requestId: ctx.request_id,
        status: 'REJECTED',
      });
      result.request = updated;

      await q.insertNotification(client, {
        userId: ctx.employee_user_id,
        title: 'Your leave request was rejected',
        body: `${ctx.leave_name} from ${ctx.start_date} to ${ctx.end_date} was rejected.${comment ? ` Reason: ${comment}` : ''}`,
        link: `/leave/requests/${ctx.request_id}`,
      });
    } else if (isLastStep) {
      const updated = await leaveQ.updateRequestStatus(client, {
        requestId: ctx.request_id,
        status: 'APPROVED',
      });
      result.request = updated;

      // Exactly one CONSUMED row, and only for a paid type (§12 test 2). day_count is
      // carried as a string so the negation never passes through a float (§1.9).
      if (ctx.is_paid) {
        result.ledgerEntry = await leaveQ.insertLedgerRow(client, {
          employeeId: ctx.employee_id,
          leaveTypeId: ctx.leave_type_id,
          delta: `-${ctx.day_count}`,
          reason: 'CONSUMED',
          refRequestId: ctx.request_id,
          note: `Approved leave ${ctx.start_date} to ${ctx.end_date}`,
          createdBy: actor.id,
        });
      }

      // Only the working days become ON_LEAVE. §5.3 resolves holidays and weekends
      // ahead of leave, so writing over those would contradict the recompute.
      const holidays = await leaveQ.getHolidaysBetween(client, {
        start: ctx.start_date,
        end: ctx.end_date,
      });
      const holidaySet = new Set(holidays.map((h) => h.holiday_date));
      const workingDates = eachDateInRange(ctx.start_date, ctx.end_date).filter(
        (d) => !isWeekend(d) && !holidaySet.has(d)
      );
      const written = await q.upsertAttendanceOnLeave(client, {
        employeeId: ctx.employee_id,
        dates: workingDates,
        requestId: ctx.request_id,
      });
      result.attendanceDays = written.length;

      await q.insertNotification(client, {
        userId: ctx.employee_user_id,
        title: 'Your leave request was approved',
        body: `${ctx.leave_name} from ${ctx.start_date} to ${ctx.end_date} (${ctx.day_count} day(s)) was approved.`,
        link: `/leave/requests/${ctx.request_id}`,
      });
    } else {
      // Hand it to the next approver. No balance moves until the chain completes.
      const advanced = await q.advanceRequestStep(client, { requestId: ctx.request_id });
      result.request = { id: ctx.request_id, status: 'PENDING', current_step: advanced?.current_step };

      const nextRole = await q.findStepRole(client, {
        requestId: ctx.request_id,
        stepNo: advanced.current_step,
      });
      if (nextRole) {
        await leaveQ.notifyApproverRoles(client, {
          roles: [nextRole],
          title: 'Leave request awaiting your approval',
          body: `${ctx.employee_name} requested ${ctx.day_count} day(s) of ${ctx.leave_name} from ${ctx.start_date} to ${ctx.end_date}. Step ${step.step_no} is cleared.`,
          link: `/admin/approvals?request=${ctx.request_id}`,
        });
      }

      await q.insertNotification(client, {
        userId: ctx.employee_user_id,
        title: 'Your leave request advanced',
        body: `Step ${step.step_no} was approved. Waiting on ${nextRole ?? 'the next approver'}.`,
        link: `/leave/requests/${ctx.request_id}`,
      });
    }

    result.employeeUserId = ctx.employee_user_id;
    result.leaveCode = ctx.leave_code;
    return result;
  });

  // After COMMIT, never inside the transaction: a rollback would otherwise leave
  // subscribers believing in a decision that never happened.
  broadcast('approval:decided', {
    requestId: String(outcome.requestId),
    stepNo: outcome.step.step_no,
    action,
    decidedBy: String(actor.id),
    requestStatus: outcome.request?.status ?? null,
    currentStep: outcome.request?.current_step ?? null,
    leaveCode: outcome.leaveCode,
    consumed: outcome.ledgerEntry?.delta ?? null,
  });

  return outcome;
}
