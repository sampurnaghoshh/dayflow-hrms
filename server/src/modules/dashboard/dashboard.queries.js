/**
 * SQL only. Every function takes (client, params) and returns rows.
 *
 * A note on number types in this file. Everywhere else NUMERIC leaves the database as a
 * string, because it is money or leave days and must never touch a float (§1.9). Here,
 * counts are cast to int and percentages to float8 and arrive as JSON numbers: they are
 * display-only aggregates feeding two recharts components, nothing is ever computed
 * from them, and a chart library given "92.3" plots nothing. Balances on the employee
 * dashboard still come back as strings.
 */

/**
 * KPI 1 - attendance rate over the last 30 days, per department (CLAUDE.md §7).
 *
 * The denominator excludes WEEKEND and HOLIDAY rows, so the percentage is out of days
 * somebody was actually expected to work. NULLIF guards a department whose every row in
 * the window is a weekend, which would otherwise divide by zero.
 *
 * The JOIN to departments is inner, so employees with no department are not counted.
 */
export async function getAttendanceRateByDepartment(client) {
  const { rows } = await client.query(
    `SELECT d.name,
            ROUND(100.0 * COUNT(*) FILTER (WHERE ad.status='PRESENT')
                  / NULLIF(COUNT(*) FILTER (WHERE ad.status NOT IN ('WEEKEND','HOLIDAY')),0), 1)::float8 AS attendance_pct,
            COUNT(*) FILTER (WHERE ad.status = 'PRESENT')::int AS present_days,
            COUNT(*) FILTER (WHERE ad.status NOT IN ('WEEKEND','HOLIDAY'))::int AS working_days
     FROM attendance_days ad
     JOIN employees e ON e.id = ad.employee_id
     JOIN departments d ON d.id = e.department_id
     WHERE ad.work_date >= CURRENT_DATE - 30
     GROUP BY d.name ORDER BY attendance_pct`
  );
  return rows;
}

/**
 * KPI 2 - the Monday/Friday absence pattern that drives the flagged list (§7).
 *
 * EXTRACT(dow) 1 and 5 are Monday and Friday - the days a long weekend gets stretched.
 * Only employees with at least 3 absences in 90 days are considered, so one bad week
 * does not put somebody on a list.
 *
 * §7 labels this "window function"; as specified it uses FILTER aggregates and no
 * OVER() clause. Kept exactly as written, because the output is what the dashboard
 * needs. The genuine window function in this codebase is the running balance on the
 * leave ledger tape.
 */
export async function getFlaggedAbsencePatterns(client) {
  const { rows } = await client.query(
    `SELECT e.id AS employee_id,
            e.full_name,
            COUNT(*) FILTER (WHERE EXTRACT(dow FROM ad.work_date) IN (1,5)
                               AND ad.status='ABSENT')::int AS edge_day_absences,
            COUNT(*) FILTER (WHERE ad.status='ABSENT')::int  AS total_absences
     FROM attendance_days ad JOIN employees e ON e.id=ad.employee_id
     WHERE ad.work_date >= CURRENT_DATE - 90
     GROUP BY e.id, e.full_name
     HAVING COUNT(*) FILTER (WHERE ad.status='ABSENT') >= 3
     ORDER BY edge_day_absences DESC LIMIT 5`
  );
  return rows;
}

/** Headline counts for the admin dashboard (SRS 3.2.2). */
export async function getAdminCounts(client, { timezone }) {
  const { rows } = await client.query(
    `WITH today AS (SELECT (now() AT TIME ZONE $1)::date AS d)
     SELECT
       (SELECT COUNT(*)::int FROM employees)                                        AS employees,
       (SELECT COUNT(*)::int FROM users WHERE status = 'ACTIVE')                    AS active_users,
       (SELECT COUNT(*)::int FROM users WHERE status = 'PENDING_VERIFICATION')      AS pending_verification,
       (SELECT COUNT(*)::int FROM departments)                                      AS departments,
       (SELECT COUNT(*)::int FROM v_pending_approvals)                              AS pending_approvals,
       (SELECT COUNT(*)::int FROM leave_requests WHERE status = 'PENDING')          AS pending_requests,
       (SELECT COUNT(*)::int FROM attendance_days ad, today t
         WHERE ad.work_date = t.d AND ad.status = 'ON_LEAVE')                       AS on_leave_today,
       (SELECT COUNT(*)::int FROM attendance_days ad, today t
         WHERE ad.work_date = t.d AND ad.status IN ('PRESENT','HALF_DAY'))          AS present_today,
       (SELECT COUNT(*)::int FROM payslips)                                         AS payslips_generated`,
    [timezone]
  );
  return rows[0];
}

export async function getLeaveRequestsByStatus(client) {
  const { rows } = await client.query(
    `SELECT status, COUNT(*)::int AS count
     FROM leave_requests
     GROUP BY status
     ORDER BY status`
  );
  return rows;
}

/** Headcount per department, for the admin overview list. */
export async function getHeadcountByDepartment(client) {
  const { rows } = await client.query(
    `SELECT d.id, d.code, d.name, COUNT(e.id)::int AS headcount
     FROM departments d
     LEFT JOIN employees e ON e.department_id = d.id
     GROUP BY d.id, d.code, d.name
     ORDER BY d.name`
  );
  return rows;
}

/** The most recent requests, whatever their state - the admin's "what just happened". */
export async function getRecentLeaveRequests(client, { limit }) {
  const { rows } = await client.query(
    `SELECT r.id, r.employee_id, e.full_name, lt.code AS leave_code,
            r.start_date, r.end_date, ROUND(r.day_count, 2)::text AS day_count,
            r.status, r.current_step, r.created_at
     FROM leave_requests r
     JOIN employees e    ON e.id = r.employee_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// --- employee dashboard (SRS 3.2.1) -----------------------------------------

/** This month's attendance shape, as counts rather than rows. */
export async function getMonthAttendanceSummary(client, { employeeId, timezone }) {
  const { rows } = await client.query(
    `WITH bounds AS (
       SELECT date_trunc('month', (now() AT TIME ZONE $2)::date)::date AS month_start,
              (date_trunc('month', (now() AT TIME ZONE $2)::date) + INTERVAL '1 month - 1 day')::date AS month_end
     )
     SELECT b.month_start,
            b.month_end,
            COUNT(*) FILTER (WHERE ad.status = 'PRESENT')::int   AS present,
            COUNT(*) FILTER (WHERE ad.status = 'HALF_DAY')::int  AS half_day,
            COUNT(*) FILTER (WHERE ad.status = 'ABSENT')::int    AS absent,
            COUNT(*) FILTER (WHERE ad.status = 'ON_LEAVE')::int  AS on_leave,
            COUNT(*) FILTER (WHERE ad.status IN ('WEEKEND','HOLIDAY'))::int AS non_working,
            COALESCE(SUM(ad.worked_minutes), 0)::int             AS worked_minutes
     FROM bounds b
     LEFT JOIN attendance_days ad
            ON ad.employee_id = $1
           AND ad.work_date BETWEEN b.month_start AND b.month_end
     GROUP BY b.month_start, b.month_end`,
    [employeeId, timezone]
  );
  return rows[0];
}

/** Today's row plus whether they are currently punched in. */
export async function getTodayForEmployee(client, { employeeId, timezone }) {
  const { rows } = await client.query(
    `WITH today AS (SELECT (now() AT TIME ZONE $2)::date AS d),
     last_punch AS (
       SELECT direction
       FROM attendance_punches p, today t
       WHERE p.employee_id = $1 AND (p.punch_at AT TIME ZONE $2)::date = t.d
       ORDER BY p.punch_at DESC, p.id DESC
       LIMIT 1
     )
     SELECT t.d AS work_date,
            COALESCE(ad.status::text, 'ABSENT') AS status,
            COALESCE(ad.worked_minutes, 0)      AS worked_minutes,
            ad.first_in,
            ad.last_out,
            COALESCE((SELECT direction FROM last_punch) = 'IN', false) AS currently_in
     FROM today t
     LEFT JOIN attendance_days ad ON ad.employee_id = $1 AND ad.work_date = t.d`,
    [employeeId, timezone]
  );
  return rows[0];
}

export async function getEmployeeLeaveCounts(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int  AS pending,
            COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
            COUNT(*) FILTER (WHERE status = 'APPROVED' AND start_date >= CURRENT_DATE)::int AS upcoming
     FROM leave_requests
     WHERE employee_id = $1`,
    [employeeId]
  );
  return rows[0];
}

/** Next few public holidays, so the dashboard can show what is coming. */
export async function getUpcomingHolidays(client, { limit }) {
  const { rows } = await client.query(
    `SELECT holiday_date, name FROM holidays
     WHERE holiday_date >= CURRENT_DATE
     ORDER BY holiday_date
     LIMIT $1`,
    [limit]
  );
  return rows;
}
