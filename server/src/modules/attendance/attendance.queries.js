/**
 * SQL only. Every function takes (client, params) and returns rows.
 *
 * Every conversion from a punch (TIMESTAMPTZ, an instant) to a work_date (DATE, a
 * calendar day) goes through `AT TIME ZONE $tz` with env.APP_TIMEZONE. Postgres runs
 * UTC and the app host may not, so letting either one's default decide would file
 * late-evening punches against the wrong business day.
 */

/**
 * Records a punch at SERVER time (§1.8) - punch_at is left to its now() default and no
 * client-supplied timestamp is accepted anywhere in this file.
 *
 * ON CONFLICT DO NOTHING makes a retry with the same idempotency key a no-op rather
 * than a second punch; the caller reads the original back and reports it unchanged.
 * That is what makes the endpoint safe for a flaky mobile connection to retry.
 */
export async function insertPunch(client, { employeeId, direction, source, idempotencyKey }) {
  const { rows } = await client.query(
    `INSERT INTO attendance_punches (employee_id, direction, source, idempotency_key)
     VALUES ($1, $2::punch_direction, $3, $4)
     ON CONFLICT (employee_id, idempotency_key) WHERE idempotency_key IS NOT NULL
       DO NOTHING
     RETURNING id, employee_id, punch_at, direction, source, idempotency_key`,
    [employeeId, direction, source, idempotencyKey ?? null]
  );
  return rows[0] ?? null;
}

export async function findPunchByIdempotencyKey(client, { employeeId, idempotencyKey }) {
  const { rows } = await client.query(
    `SELECT id, employee_id, punch_at, direction, source, idempotency_key
     FROM attendance_punches
     WHERE employee_id = $1 AND idempotency_key = $2`,
    [employeeId, idempotencyKey]
  );
  return rows[0] ?? null;
}

/** The business-day date, per the configured timezone, as postgres sees it right now. */
export async function currentWorkDate(client, { timezone }) {
  const { rows } = await client.query(`SELECT (now() AT TIME ZONE $1)::date AS work_date`, [
    timezone,
  ]);
  return rows[0].work_date;
}

/** Every punch an employee made on one business day, in order. */
export async function getPunchesForDate(client, { employeeId, workDate, timezone }) {
  const { rows } = await client.query(
    `SELECT id, punch_at, direction
     FROM attendance_punches
     WHERE employee_id = $1
       AND (punch_at AT TIME ZONE $3)::date = $2::date
     ORDER BY punch_at, id`,
    [employeeId, workDate, timezone]
  );
  return rows;
}

/** The last punch of the day, which is what decides whether an OUT is legal. */
export async function getLastPunchOfDay(client, { employeeId, workDate, timezone }) {
  const { rows } = await client.query(
    `SELECT id, punch_at, direction
     FROM attendance_punches
     WHERE employee_id = $1
       AND (punch_at AT TIME ZONE $3)::date = $2::date
     ORDER BY punch_at DESC, id DESC
     LIMIT 1`,
    [employeeId, workDate, timezone]
  );
  return rows[0] ?? null;
}

/**
 * attendance_days is derived state, safe to rebuild from punches at any time, so
 * ON CONFLICT DO UPDATE is right here. This is not the ledger.
 */
export async function upsertAttendanceDay(
  client,
  { employeeId, workDate, status, workedMinutes, firstIn, lastOut, leaveRequestId }
) {
  const { rows } = await client.query(
    `INSERT INTO attendance_days
       (employee_id, work_date, status, worked_minutes, first_in, last_out, leave_request_id, computed_at)
     VALUES ($1, $2::date, $3::day_status, $4, $5, $6, $7, now())
     ON CONFLICT (employee_id, work_date) DO UPDATE
       SET status = EXCLUDED.status,
           worked_minutes = EXCLUDED.worked_minutes,
           first_in = EXCLUDED.first_in,
           last_out = EXCLUDED.last_out,
           leave_request_id = EXCLUDED.leave_request_id,
           computed_at = now()
     RETURNING employee_id, work_date, status, worked_minutes, first_in, last_out, leave_request_id`,
    [employeeId, workDate, status, workedMinutes, firstIn ?? null, lastOut ?? null, leaveRequestId ?? null]
  );
  return rows[0];
}

/** SRS 3.4.1 - an employee's own daily record. */
export async function getAttendanceDays(client, { employeeId, from, to }) {
  const { rows } = await client.query(
    `SELECT ad.employee_id, ad.work_date, ad.status, ad.worked_minutes,
            ad.first_in, ad.last_out, ad.leave_request_id, ad.computed_at,
            lt.code AS leave_code
     FROM attendance_days ad
     LEFT JOIN leave_requests lr ON lr.id = ad.leave_request_id
     LEFT JOIN leave_types lt    ON lt.id = lr.leave_type_id
     WHERE ad.employee_id = $1
       AND ad.work_date BETWEEN $2::date AND $3::date
     ORDER BY ad.work_date`,
    [employeeId, from, to]
  );
  return rows;
}

/**
 * The weekly rollup (SRS 3.4.1).
 *
 * date_trunc('week') is ISO - weeks start Monday - which is what makes the buckets
 * line up with the Monday/Friday absence analysis on the admin dashboard.
 */
export async function getWeeklyRollup(client, { employeeId, from, to }) {
  const { rows } = await client.query(
    `SELECT date_trunc('week', ad.work_date)::date AS week_start,
            SUM(ad.worked_minutes)::int                                   AS worked_minutes,
            COUNT(*) FILTER (WHERE ad.status = 'PRESENT')::int            AS present_days,
            COUNT(*) FILTER (WHERE ad.status = 'HALF_DAY')::int           AS half_days,
            COUNT(*) FILTER (WHERE ad.status = 'ABSENT')::int             AS absent_days,
            COUNT(*) FILTER (WHERE ad.status = 'ON_LEAVE')::int           AS leave_days,
            COUNT(*) FILTER (WHERE ad.status IN ('WEEKEND','HOLIDAY'))::int AS non_working_days
     FROM attendance_days ad
     WHERE ad.employee_id = $1
       AND ad.work_date BETWEEN $2::date AND $3::date
     GROUP BY 1
     ORDER BY 1`,
    [employeeId, from, to]
  );
  return rows;
}

/** SRS 3.4.2 - HR/ADMIN view across employees. */
export async function getAttendanceAcrossEmployees(
  client,
  { employeeId, from, to, limit, offset }
) {
  const { rows } = await client.query(
    `SELECT ad.employee_id, e.full_name, d.code AS department_code,
            ad.work_date, ad.status, ad.worked_minutes, ad.first_in, ad.last_out,
            COUNT(*) OVER ()::int AS total_count
     FROM attendance_days ad
     JOIN employees e        ON e.id = ad.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE ($1::bigint IS NULL OR ad.employee_id = $1)
       AND ad.work_date BETWEEN $2::date AND $3::date
     ORDER BY ad.work_date DESC, e.full_name
     LIMIT $4 OFFSET $5`,
    [employeeId ?? null, from, to, limit, offset]
  );
  return rows;
}

/**
 * The live presence board.
 *
 * Every active employee appears, whether or not they have punched, so the board shows
 * who is missing rather than only who is here. `currently_in` is derived from the
 * direction of each employee's most recent punch today.
 */
export async function getTodayBoard(client, { timezone }) {
  const { rows } = await client.query(
    `WITH today AS (SELECT (now() AT TIME ZONE $1)::date AS d),
     todays_punches AS (
       SELECT p.employee_id,
              MIN(p.punch_at) FILTER (WHERE p.direction = 'IN')  AS first_in,
              MAX(p.punch_at) FILTER (WHERE p.direction = 'OUT') AS last_out,
              (ARRAY_AGG(p.direction ORDER BY p.punch_at DESC, p.id DESC))[1] AS last_direction,
              COUNT(*)::int AS punch_count
       FROM attendance_punches p, today t
       WHERE (p.punch_at AT TIME ZONE $1)::date = t.d
       GROUP BY p.employee_id
     )
     SELECT e.id                AS employee_id,
            e.full_name,
            d.code              AS department_code,
            t.d                 AS work_date,
            COALESCE(ad.status::text, 'ABSENT') AS status,
            COALESCE(ad.worked_minutes, 0)      AS worked_minutes,
            tp.first_in,
            tp.last_out,
            COALESCE(tp.punch_count, 0)         AS punch_count,
            (tp.last_direction = 'IN')          AS currently_in
     FROM employees e
     CROSS JOIN today t
     JOIN users u                ON u.id = e.user_id AND u.status = 'ACTIVE'
     LEFT JOIN departments d     ON d.id = e.department_id
     LEFT JOIN todays_punches tp ON tp.employee_id = e.id
     LEFT JOIN attendance_days ad ON ad.employee_id = e.id AND ad.work_date = t.d
     ORDER BY (tp.last_direction = 'IN') DESC NULLS LAST, e.full_name`,
    [timezone]
  );
  return rows;
}

// --- recompute inputs -------------------------------------------------------
// Fetched in bulk and paired up in JavaScript by the pure deriveDay(), rather than
// running one query per employee per day.

export async function getPunchesInRange(client, { employeeId, from, to, timezone }) {
  const { rows } = await client.query(
    `SELECT employee_id,
            (punch_at AT TIME ZONE $4)::date AS work_date,
            punch_at,
            direction
     FROM attendance_punches
     WHERE ($1::bigint IS NULL OR employee_id = $1)
       AND (punch_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
     ORDER BY employee_id, punch_at, id`,
    [employeeId ?? null, from, to, timezone]
  );
  return rows;
}

/** Approved leave overlapping the window, so days inside it resolve to ON_LEAVE. */
export async function getApprovedLeavesInRange(client, { employeeId, from, to }) {
  const { rows } = await client.query(
    `SELECT id, employee_id, start_date, end_date
     FROM leave_requests
     WHERE status = 'APPROVED'
       AND ($1::bigint IS NULL OR employee_id = $1)
       AND period && daterange($2::date, $3::date, '[]')
     ORDER BY employee_id, start_date`,
    [employeeId ?? null, from, to]
  );
  return rows;
}

export async function getActiveEmployees(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT e.id, e.date_of_joining
     FROM employees e
     JOIN users u ON u.id = e.user_id AND u.status = 'ACTIVE'
     WHERE ($1::bigint IS NULL OR e.id = $1)
     ORDER BY e.id`,
    [employeeId ?? null]
  );
  return rows;
}

/** The user behind an employee, for addressing SSE events and notifications. */
export async function getUserIdForEmployee(client, { employeeId }) {
  const { rows } = await client.query('SELECT user_id FROM employees WHERE id = $1', [employeeId]);
  return rows[0]?.user_id ?? null;
}
