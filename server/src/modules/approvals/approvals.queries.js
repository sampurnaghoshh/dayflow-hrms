/**
 * SQL only. Every function takes (client, params) and returns rows.
 *
 * Shared statements - locking the request, moving the ledger, closing leftover steps -
 * are imported from leave.queries.js rather than restated here. There is exactly one
 * INSERT into leave_balance_ledger in this codebase and it lives in that file.
 */

/**
 * The work queue (§6 GET /approvals/queue), read from v_pending_approvals.
 *
 * The view already restricts itself to steps whose step_no equals the request's
 * current_step, so nothing here can surface a step that is not actually actionable yet.
 *
 * Own requests are filtered out: an approver may not decide their own leave, so showing
 * it in their queue would only offer them a button that always fails.
 */
export async function listQueue(client, { roles, excludeEmployeeId, limit, offset }) {
  const { rows } = await client.query(
    `SELECT step_id,
            request_id,
            step_no,
            approver_role,
            employee_id,
            full_name,
            department_id,
            leave_code,
            start_date,
            end_date,
            ROUND(day_count, 2)::text AS day_count,
            remarks,
            created_at,
            COUNT(*) OVER ()::int AS total_count
     FROM v_pending_approvals
     WHERE approver_role = ANY($1::user_role[])
       AND ($2::bigint IS NULL OR employee_id <> $2)
     ORDER BY created_at ASC, request_id ASC
     LIMIT $3 OFFSET $4`,
    [roles, excludeEmployeeId ?? null, limit, offset]
  );
  return rows;
}

/**
 * §5.2's lock, reached through the step the caller named.
 *
 * FOR UPDATE OF r takes a row lock on leave_requests only. A second approver acting on
 * the same request at the same instant blocks here until the first transaction commits;
 * postgres then re-evaluates this row against the newest committed version, so the
 * loser wakes up looking at the new state rather than the stale one it queued on.
 *
 * The step itself is read separately by lockStep() below, deliberately: rows joined
 * into a FOR UPDATE query that are not themselves locked are still served from the
 * original snapshot, so reading the step here could hand back a pre-race value.
 */
export async function lockRequestByStepId(client, { stepId }) {
  const { rows } = await client.query(
    `SELECT r.id            AS request_id,
            r.employee_id,
            r.leave_type_id,
            r.status        AS request_status,
            r.current_step,
            r.start_date,
            r.end_date,
            ROUND(r.day_count, 2)::text AS day_count,
            lt.is_paid,
            lt.code         AS leave_code,
            lt.name         AS leave_name,
            e.full_name     AS employee_name,
            e.user_id       AS employee_user_id,
            (SELECT MAX(step_no) FROM approval_steps WHERE request_id = r.id) AS max_step_no
     FROM approval_steps s
     JOIN leave_requests r ON r.id = s.request_id
     JOIN leave_types lt   ON lt.id = r.leave_type_id
     JOIN employees e      ON e.id = r.employee_id
     WHERE s.id = $1
     FOR UPDATE OF r`,
    [stepId]
  );
  return rows[0] ?? null;
}

/**
 * Reads the step under its own lock, in a statement issued after the request lock is
 * held. READ COMMITTED gives every statement a fresh snapshot, so this sees whatever
 * the transaction that just released the request lock committed.
 *
 * Lock order is always request-then-step, in every path, which is what keeps two
 * approvers from deadlocking against each other.
 */
export async function lockStep(client, { stepId }) {
  const { rows } = await client.query(
    `SELECT id AS step_id, request_id, step_no, approver_role, approver_user_id,
            status AS step_status, comment, acted_at
     FROM approval_steps
     WHERE id = $1
     FOR UPDATE`,
    [stepId]
  );
  return rows[0] ?? null;
}

/**
 * The most recent decision on this request, used to name a person in the 409 body
 * rather than telling the loser only that they lost.
 */
export async function findLatestDecision(client, { requestId }) {
  const { rows } = await client.query(
    `SELECT s.step_no,
            s.status,
            s.acted_at,
            s.comment,
            s.approver_user_id,
            e.full_name AS approver_name,
            u.email     AS approver_email,
            u.role      AS approver_role
     FROM approval_steps s
     LEFT JOIN users u     ON u.id = s.approver_user_id
     LEFT JOIN employees e ON e.user_id = u.id
     WHERE s.request_id = $1
       AND s.status IN ('APPROVED', 'REJECTED')
     ORDER BY s.acted_at DESC NULLS LAST, s.step_no DESC
     LIMIT 1`,
    [requestId]
  );
  return rows[0] ?? null;
}

/** Has this user already signed off a different step of this same request? */
export async function findUserDecisionOnRequest(client, { requestId, userId, excludeStepId }) {
  const { rows } = await client.query(
    `SELECT step_no, status, acted_at
     FROM approval_steps
     WHERE request_id = $1
       AND approver_user_id = $2
       AND id <> $3
       AND status IN ('APPROVED', 'REJECTED')
     ORDER BY step_no
     LIMIT 1`,
    [requestId, userId, excludeStepId]
  );
  return rows[0] ?? null;
}

/**
 * Records the decision. The `status = 'PENDING'` predicate is a second line of defence
 * behind the row lock: if it ever matches zero rows, someone decided this step while we
 * held what we believed was an exclusive lock, and the caller turns that into a 409
 * instead of silently reporting success.
 */
export async function markStepDecided(client, { stepId, status, approverUserId, comment }) {
  const { rows } = await client.query(
    `UPDATE approval_steps
     SET status = $2::step_status,
         approver_user_id = $3,
         comment = $4,
         acted_at = now()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING id, step_no, status, approver_user_id, comment, acted_at`,
    [stepId, status, approverUserId, comment ?? null]
  );
  return rows[0] ?? null;
}

/** Hands the request to the next step in the chain. */
export async function advanceRequestStep(client, { requestId }) {
  const { rows } = await client.query(
    `UPDATE leave_requests
     SET current_step = current_step + 1
     WHERE id = $1 AND status = 'PENDING'
     RETURNING id, current_step`,
    [requestId]
  );
  return rows[0] ?? null;
}

/** The approver_role the next step expects, so the right people get notified. */
export async function findStepRole(client, { requestId, stepNo }) {
  const { rows } = await client.query(
    `SELECT approver_role FROM approval_steps WHERE request_id = $1 AND step_no = $2`,
    [requestId, stepNo]
  );
  return rows[0]?.approver_role ?? null;
}

/**
 * Marks the working days of an approved leave as ON_LEAVE (§5.2).
 *
 * Only working days are passed in. §5.3 resolves a holiday to HOLIDAY and a Saturday to
 * WEEKEND before it ever considers leave, so writing ON_LEAVE over those would contradict
 * the derivation that POST /attendance/recompute rebuilds from punches.
 *
 * attendance_days is derived state, not a ledger, so ON CONFLICT DO UPDATE is correct
 * here - it is safe to recompute at any time.
 */
export async function upsertAttendanceOnLeave(client, { employeeId, dates, requestId }) {
  if (dates.length === 0) return [];
  const { rows } = await client.query(
    `INSERT INTO attendance_days (employee_id, work_date, status, leave_request_id, computed_at)
     SELECT $1, d::date, 'ON_LEAVE', $2, now()
     FROM UNNEST($3::date[]) AS d
     ON CONFLICT (employee_id, work_date) DO UPDATE
       SET status = 'ON_LEAVE',
           leave_request_id = EXCLUDED.leave_request_id,
           computed_at = now()
     RETURNING work_date`,
    [employeeId, requestId, dates]
  );
  return rows;
}

export async function insertNotification(client, { userId, title, body, link }) {
  const { rows } = await client.query(
    `INSERT INTO notifications (user_id, title, body, link)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id`,
    [userId, title, body ?? null, link ?? null]
  );
  return rows[0];
}
