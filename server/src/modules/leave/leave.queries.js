/**
 * SQL only. Every function takes (client, params) and returns rows.
 *
 * NUMERIC columns are rendered with ROUND(x, 2)::text before they leave the database.
 * Two reasons: pg hands NUMERIC back as a string anyway, and the raw string carries
 * whatever scale the expression happened to produce - v_leave_balances uses
 * COALESCE(SUM(delta), 0), so an employee with no ledger rows reads '0' while one
 * with rows reads '7.50'. Forcing the scale here means the client formats one shape.
 */

export async function listActiveLeaveTypes(client) {
  const { rows } = await client.query(
    `SELECT id, code, name, is_paid,
            ROUND(accrual_per_month, 2)::text AS accrual_per_month,
            CASE WHEN annual_cap IS NULL THEN NULL ELSE ROUND(annual_cap, 2)::text END AS annual_cap,
            ROUND(carry_forward_cap, 2)::text AS carry_forward_cap,
            requires_document
     FROM leave_types
     WHERE is_active
     ORDER BY code`
  );
  return rows;
}

export async function getLeaveTypeById(client, { leaveTypeId }) {
  const { rows } = await client.query(
    `SELECT id, code, name, is_paid, is_active FROM leave_types WHERE id = $1`,
    [leaveTypeId]
  );
  return rows[0] ?? null;
}

/** The ONLY way balances are read (CLAUDE.md §1.1). Never a stored column. */
export async function getBalances(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT leave_type_id,
            leave_code,
            leave_name,
            ROUND(balance, 2)::text        AS balance,
            ROUND(total_accrued, 2)::text  AS total_accrued,
            ROUND(total_consumed, 2)::text AS total_consumed
     FROM v_leave_balances
     WHERE employee_id = $1
     ORDER BY leave_code`,
    [employeeId]
  );
  return rows;
}

/**
 * Answers "is there enough left?" in NUMERIC, inside postgres.
 *
 * The comparison deliberately does not happen in JavaScript: parsing '7.50' into a
 * float to compare it against a day count would reintroduce exactly the imprecision
 * that NUMERIC exists to prevent (§1.9).
 */
export async function getBalanceForType(client, { employeeId, leaveTypeId, required }) {
  const { rows } = await client.query(
    `SELECT ROUND(balance, 2)::text AS balance,
            (balance >= $3::numeric) AS sufficient
     FROM v_leave_balances
     WHERE employee_id = $1 AND leave_type_id = $2`,
    [employeeId, leaveTypeId, required]
  );
  return rows[0] ?? null;
}

/**
 * The full transaction tape with a running balance.
 *
 * PARTITION BY leave_type_id matters: a running total that mixed paid and sick leave
 * into one column would be a number that describes nothing.
 *
 * The ORDER BY carries created_at AND id because created_at is now(), which is
 * transaction time - the OPENING rows written for several leave types during one
 * registration all share a timestamp to the microsecond. Without the id tiebreak the
 * window frame, and therefore the running balance, would be non-deterministic.
 */
export async function getLedgerTape(client, { employeeId, leaveTypeId }) {
  const { rows } = await client.query(
    `SELECT l.id,
            l.created_at,
            l.reason,
            l.note,
            l.ref_request_id,
            lt.id   AS leave_type_id,
            lt.code AS leave_code,
            lt.name AS leave_name,
            ROUND(l.delta, 2)::text AS delta,
            ROUND(SUM(l.delta) OVER (
              PARTITION BY l.leave_type_id
              ORDER BY l.created_at, l.id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ), 2)::text AS running_balance
     FROM leave_balance_ledger l
     JOIN leave_types lt ON lt.id = l.leave_type_id
     WHERE l.employee_id = $1
       AND ($2::bigint IS NULL OR l.leave_type_id = $2)
     ORDER BY lt.code, l.created_at, l.id`,
    [employeeId, leaveTypeId ?? null]
  );
  return rows;
}

/** Used to name the applicant in the approver's notification. */
export async function getEmployeeName(client, { employeeId }) {
  const { rows } = await client.query(`SELECT full_name FROM employees WHERE id = $1`, [employeeId]);
  return rows[0]?.full_name ?? null;
}

export async function getHolidaysBetween(client, { start, end }) {
  const { rows } = await client.query(
    `SELECT holiday_date, name FROM holidays
     WHERE holiday_date BETWEEN $1 AND $2
     ORDER BY holiday_date`,
    [start, end]
  );
  return rows;
}

/**
 * §5.1 step 4. The no_overlapping_live_leave EXCLUDE constraint rejects a request
 * that collides with a PENDING or APPROVED one; that surfaces as 23P01 and the error
 * handler turns it into 409 LEAVE_DATES_OVERLAP. No application-level check needed.
 */
export async function insertLeaveRequest(
  client,
  { employeeId, leaveTypeId, startDate, endDate, dayCount, remarks }
) {
  const { rows } = await client.query(
    `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, day_count, remarks)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, employee_id, leave_type_id, start_date, end_date,
               ROUND(day_count, 2)::text AS day_count,
               remarks, status, current_step, created_at, decided_at`,
    [employeeId, leaveTypeId, startDate, endDate, dayCount, remarks ?? null]
  );
  return rows[0];
}

/**
 * §5.1 step 5, verbatim. Routing lives in the database (§1.3): adding an approval
 * level is an INSERT into approval_chain_rules, not a branch in this codebase.
 */
export async function getApprovalChainRules(client, { leaveTypeId, dayCount }) {
  const { rows } = await client.query(
    `SELECT id, step_no, approver_role
     FROM approval_chain_rules
     WHERE (leave_type_id = $1 OR leave_type_id IS NULL)
       AND $2::numeric BETWEEN min_days AND max_days
     ORDER BY step_no`,
    [leaveTypeId, dayCount]
  );
  return rows;
}

/** One approval_steps row per matched rule, inserted as a single statement. */
export async function insertApprovalSteps(client, { requestId, stepNos, approverRoles }) {
  const { rows } = await client.query(
    `INSERT INTO approval_steps (request_id, step_no, approver_role)
     SELECT $1, s.step_no, s.approver_role
     FROM UNNEST($2::smallint[], $3::user_role[]) AS s(step_no, approver_role)
     RETURNING id, step_no, approver_role, status`,
    [requestId, stepNos, approverRoles]
  );
  return rows;
}

/** §5.1 step 6. Notifies every active user holding one of the approver roles. */
export async function notifyApproverRoles(client, { roles, title, body, link }) {
  const { rows } = await client.query(
    `INSERT INTO notifications (user_id, title, body, link)
     SELECT u.id, $2, $3, $4
     FROM users u
     WHERE u.role = ANY($1::user_role[]) AND u.status = 'ACTIVE'
     RETURNING id, user_id`,
    [roles, title, body, link]
  );
  return rows;
}

/**
 * COUNT(*) OVER () returns the unpaginated total alongside the page, so the list
 * envelope in §6 costs one round trip instead of a query plus a separate count.
 */
export async function listLeaveRequests(client, { employeeId, status, limit, offset }) {
  const { rows } = await client.query(
    `SELECT r.id,
            r.employee_id,
            e.full_name,
            r.leave_type_id,
            lt.code AS leave_code,
            lt.name AS leave_name,
            r.start_date,
            r.end_date,
            ROUND(r.day_count, 2)::text AS day_count,
            r.remarks,
            r.status,
            r.current_step,
            r.created_at,
            r.decided_at,
            COUNT(*) OVER ()::int AS total_count
     FROM leave_requests r
     JOIN employees e    ON e.id = r.employee_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     WHERE ($1::bigint IS NULL OR r.employee_id = $1)
       AND ($2::leave_status IS NULL OR r.status = $2)
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $3 OFFSET $4`,
    [employeeId ?? null, status ?? null, limit, offset]
  );
  return rows;
}

export async function getLeaveRequestById(client, { requestId }) {
  const { rows } = await client.query(
    `SELECT r.id,
            r.employee_id,
            e.full_name,
            e.department_id,
            r.leave_type_id,
            lt.code AS leave_code,
            lt.name AS leave_name,
            lt.is_paid,
            r.start_date,
            r.end_date,
            ROUND(r.day_count, 2)::text AS day_count,
            r.remarks,
            r.status,
            r.current_step,
            r.created_at,
            r.decided_at
     FROM leave_requests r
     JOIN employees e    ON e.id = r.employee_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     WHERE r.id = $1`,
    [requestId]
  );
  return rows[0] ?? null;
}

/** The approval timeline shown on the request detail screen. */
export async function getApprovalTimeline(client, { requestId }) {
  const { rows } = await client.query(
    `SELECT s.id AS step_id,
            s.step_no,
            s.approver_role,
            s.status,
            s.comment,
            s.acted_at,
            s.approver_user_id,
            ae.full_name AS approver_name
     FROM approval_steps s
     LEFT JOIN employees ae ON ae.user_id = s.approver_user_id
     WHERE s.request_id = $1
     ORDER BY s.step_no`,
    [requestId]
  );
  return rows;
}

/**
 * Locks the request row for the duration of the transaction. Cancellation and the
 * approval engine both take this lock, so a cancel racing a decision serialises
 * instead of both acting on stale state.
 */
export async function lockLeaveRequestForUpdate(client, { requestId }) {
  const { rows } = await client.query(
    `SELECT r.id,
            r.employee_id,
            r.leave_type_id,
            r.start_date,
            r.end_date,
            ROUND(r.day_count, 2)::text AS day_count,
            r.status,
            r.current_step,
            lt.is_paid,
            lt.code AS leave_code
     FROM leave_requests r
     JOIN leave_types lt ON lt.id = r.leave_type_id
     WHERE r.id = $1
     FOR UPDATE OF r`,
    [requestId]
  );
  return rows[0] ?? null;
}

export async function updateRequestStatus(client, { requestId, status }) {
  const { rows } = await client.query(
    `UPDATE leave_requests
     SET status = $2::leave_status, decided_at = now()
     WHERE id = $1
     RETURNING id, status, decided_at`,
    [requestId, status]
  );
  return rows[0] ?? null;
}

/** Steps that never got their turn are closed as SKIPPED, not left dangling as PENDING. */
export async function skipPendingSteps(client, { requestId }) {
  const { rows } = await client.query(
    `UPDATE approval_steps
     SET status = 'SKIPPED', acted_at = now()
     WHERE request_id = $1 AND status = 'PENDING'
     RETURNING id, step_no`,
    [requestId]
  );
  return rows;
}

/**
 * The only way anything is ever written to the ledger. Append-only (§1.2): a mistake
 * is corrected by inserting a compensating row, never by UPDATE or DELETE.
 */
export async function insertLedgerRow(
  client,
  { employeeId, leaveTypeId, delta, reason, refRequestId, note, createdBy }
) {
  const { rows } = await client.query(
    `INSERT INTO leave_balance_ledger
       (employee_id, leave_type_id, delta, reason, ref_request_id, note, created_by)
     VALUES ($1, $2, $3, $4::ledger_reason, $5, $6, $7)
     RETURNING id, leave_type_id, ROUND(delta, 2)::text AS delta, reason, ref_request_id, created_at`,
    [employeeId, leaveTypeId, delta, reason, refRequestId ?? null, note ?? null, createdBy ?? null]
  );
  return rows[0];
}
