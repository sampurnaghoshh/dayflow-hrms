/**
 * SQL only. Every function takes (client, params) and returns rows.
 *
 * Money never touches JavaScript arithmetic in this file. Pro-rating, summing and
 * rounding all happen in postgres on NUMERIC columns (§1.9) - a payslip computed with
 * floats would be wrong in the last paisa, and wrong differently on different machines.
 */

/**
 * The pro-rating rule, written once and reused by both payslip statements below so a
 * line item can never disagree with the total it is supposed to explain.
 *
 * Deductions are pro-rated on the same factor as earnings, not charged in full. PF is a
 * percentage of the basic actually paid, so it genuinely does scale with payable days;
 * and charging a flat deduction against a pro-rated gross produces a negative net pay
 * for anyone with a month of loss-of-pay, which is not a payslip anyone should be handed.
 */
const PRORATED_AMOUNT = `ROUND(sc.monthly_amount * $PAYABLE::numeric / NULLIF($WORKING, 0)::numeric, 2)`;

/**
 * The version in force on a given day. validity is a half-open daterange, so a version
 * closed on the 1st does not claim the 1st - the successor does.
 */
export async function getSalaryVersionOn(client, { employeeId, onDate }) {
  const { rows } = await client.query(
    `SELECT id, employee_id, effective_from, effective_to,
            ROUND(ctc_annual, 2)::text AS ctc_annual, created_by, created_at
     FROM employee_salary_versions
     WHERE employee_id = $1 AND validity @> $2::date`,
    [employeeId, onDate]
  );
  return rows[0] ?? null;
}

/** Full history, newest first. NULL effective_to marks the open one. */
export async function getSalaryVersions(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT v.id, v.employee_id, v.effective_from, v.effective_to,
            ROUND(v.ctc_annual, 2)::text AS ctc_annual,
            v.created_at, e.full_name AS created_by_name
     FROM employee_salary_versions v
     LEFT JOIN users u    ON u.id = v.created_by
     LEFT JOIN employees e ON e.user_id = u.id
     WHERE v.employee_id = $1
     ORDER BY v.effective_from DESC, v.id DESC`,
    [employeeId]
  );
  return rows;
}

export async function getComponentsForVersions(client, { versionIds }) {
  if (versionIds.length === 0) return [];
  const { rows } = await client.query(
    `SELECT salary_version_id, code, label, kind, ROUND(monthly_amount, 2)::text AS monthly_amount
     FROM salary_components
     WHERE salary_version_id = ANY($1::bigint[])
     ORDER BY salary_version_id, kind DESC, code`,
    [versionIds]
  );
  return rows;
}

/**
 * Locks the currently-open version so two admins revising the same salary at once
 * serialise rather than both trying to close it.
 */
export async function lockOpenSalaryVersion(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT id, effective_from, effective_to, ROUND(ctc_annual, 2)::text AS ctc_annual
     FROM employee_salary_versions
     WHERE employee_id = $1 AND effective_to IS NULL
     FOR UPDATE`,
    [employeeId]
  );
  return rows[0] ?? null;
}

/**
 * Closes a version the day the next one opens. Because validity is '[)', setting
 * effective_to to the successor's effective_from makes them adjacent rather than
 * overlapping, which is what keeps no_overlapping_salary satisfied.
 */
export async function closeSalaryVersion(client, { versionId, effectiveTo }) {
  const { rows } = await client.query(
    `UPDATE employee_salary_versions
     SET effective_to = $2::date
     WHERE id = $1
     RETURNING id, effective_from, effective_to`,
    [versionId, effectiveTo]
  );
  return rows[0] ?? null;
}

export async function insertSalaryVersion(client, { employeeId, effectiveFrom, ctcAnnual, createdBy }) {
  const { rows } = await client.query(
    `INSERT INTO employee_salary_versions (employee_id, effective_from, effective_to, ctc_annual, created_by)
     VALUES ($1, $2::date, NULL, $3::numeric, $4)
     RETURNING id, employee_id, effective_from, effective_to,
               ROUND(ctc_annual, 2)::text AS ctc_annual, created_at`,
    [employeeId, effectiveFrom, ctcAnnual, createdBy]
  );
  return rows[0];
}

export async function insertSalaryComponents(client, { versionId, codes, labels, kinds, amounts }) {
  const { rows } = await client.query(
    `INSERT INTO salary_components (salary_version_id, code, label, kind, monthly_amount)
     SELECT $1, c.code, c.label, c.kind, c.amount
     FROM UNNEST($2::text[], $3::text[], $4::component_kind[], $5::numeric[])
          AS c(code, label, kind, amount)
     RETURNING code, label, kind, ROUND(monthly_amount, 2)::text AS monthly_amount`,
    [versionId, codes, labels, kinds, amounts]
  );
  return rows;
}

/** Checks the supplied earnings actually add up to a month of the stated CTC. */
export async function sumEarnings(client, { amounts, kinds }) {
  const { rows } = await client.query(
    `SELECT ROUND(COALESCE(SUM(c.amount) FILTER (WHERE c.kind = 'EARNING'), 0), 2)::text AS earnings
     FROM UNNEST($1::numeric[], $2::component_kind[]) AS c(amount, kind)`,
    [amounts, kinds]
  );
  return rows[0].earnings;
}

// --- payslips ---------------------------------------------------------------

export async function getPayslipsForEmployee(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT id, employee_id, period_month, salary_version_id,
            ROUND(payable_days, 2)::text     AS payable_days,
            ROUND(lop_days, 2)::text         AS lop_days,
            ROUND(gross_earnings, 2)::text   AS gross_earnings,
            ROUND(total_deductions, 2)::text AS total_deductions,
            ROUND(net_pay, 2)::text          AS net_pay,
            generated_at
     FROM payslips
     WHERE employee_id = $1
     ORDER BY period_month DESC`,
    [employeeId]
  );
  return rows;
}

export async function getPayslipById(client, { payslipId }) {
  const { rows } = await client.query(
    `SELECT p.id, p.employee_id, e.full_name, p.period_month, p.salary_version_id,
            ROUND(p.payable_days, 2)::text     AS payable_days,
            ROUND(p.lop_days, 2)::text         AS lop_days,
            ROUND(p.gross_earnings, 2)::text   AS gross_earnings,
            ROUND(p.total_deductions, 2)::text AS total_deductions,
            ROUND(p.net_pay, 2)::text          AS net_pay,
            p.generated_at
     FROM payslips p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.id = $1`,
    [payslipId]
  );
  return rows[0] ?? null;
}

export async function getPayslipLineItems(client, { payslipId }) {
  const { rows } = await client.query(
    `SELECT code, label, kind, ROUND(amount, 2)::text AS amount
     FROM payslip_line_items
     WHERE payslip_id = $1
     ORDER BY kind DESC, code`,
    [payslipId]
  );
  return rows;
}

/**
 * Loss-of-pay days in a month.
 *
 * An ABSENT day costs pay. So does a day of approved UNPAID leave - it resolves to
 * ON_LEAVE in attendance_days, which is why the leave type has to be consulted rather
 * than the status alone. Approved paid leave costs nothing, which is the entire point
 * of it being paid.
 */
export async function getLopDays(client, { employeeId, periodMonth }) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS lop_days
     FROM attendance_days ad
     LEFT JOIN leave_requests lr ON lr.id = ad.leave_request_id
     LEFT JOIN leave_types lt    ON lt.id = lr.leave_type_id
     WHERE ad.employee_id = $1
       AND ad.work_date >= $2::date
       AND ad.work_date < ($2::date + INTERVAL '1 month')
       AND (ad.status = 'ABSENT' OR (ad.status = 'ON_LEAVE' AND lt.is_paid = false))`,
    [employeeId, periodMonth]
  );
  return rows[0].lop_days;
}

/**
 * Writes the payslip, computing gross and deductions from the version's components.
 *
 * ON CONFLICT DO NOTHING is what makes a payroll run idempotent (§5 note on
 * UNIQUE (employee_id, period_month)): re-running the same month adds nothing and
 * quietly leaves the already-generated payslips alone. A null return means "already
 * existed", not "failed".
 */
export async function insertPayslip(
  client,
  { employeeId, periodMonth, versionId, payableDays, lopDays, workingDays, generatedBy }
) {
  const amount = PRORATED_AMOUNT.replaceAll('$PAYABLE', '$4').replaceAll('$WORKING', '$5');
  const { rows } = await client.query(
    `WITH comp AS (
       SELECT sc.kind, ${amount} AS amount
       FROM salary_components sc
       WHERE sc.salary_version_id = $3
     ), totals AS (
       SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'EARNING'), 0)   AS gross,
              COALESCE(SUM(amount) FILTER (WHERE kind = 'DEDUCTION'), 0) AS deductions
       FROM comp
     )
     INSERT INTO payslips (employee_id, period_month, salary_version_id, payable_days,
                           lop_days, gross_earnings, total_deductions, net_pay, generated_by)
     SELECT $1, $2::date, $3, $4::numeric, $6::numeric,
            t.gross, t.deductions, t.gross - t.deductions, $7
     FROM totals t
     ON CONFLICT (employee_id, period_month) DO NOTHING
     RETURNING id, employee_id, period_month,
               ROUND(payable_days, 2)::text     AS payable_days,
               ROUND(lop_days, 2)::text         AS lop_days,
               ROUND(gross_earnings, 2)::text   AS gross_earnings,
               ROUND(total_deductions, 2)::text AS total_deductions,
               ROUND(net_pay, 2)::text          AS net_pay`,
    [employeeId, periodMonth, versionId, payableDays, workingDays, lopDays, generatedBy]
  );
  return rows[0] ?? null;
}

/** The same pro-rating expression, so a line item can never disagree with the total. */
export async function insertPayslipLineItems(
  client,
  { payslipId, versionId, payableDays, workingDays }
) {
  const amount = PRORATED_AMOUNT.replaceAll('$PAYABLE', '$3').replaceAll('$WORKING', '$4');
  const { rows } = await client.query(
    `INSERT INTO payslip_line_items (payslip_id, code, label, kind, amount)
     SELECT $1, sc.code, sc.label, sc.kind, ${amount}
     FROM salary_components sc
     WHERE sc.salary_version_id = $2
     RETURNING code, kind, ROUND(amount, 2)::text AS amount`,
    [payslipId, versionId, payableDays, workingDays]
  );
  return rows;
}

/** Everyone a payroll run should consider. */
export async function listPayableEmployees(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT e.id, e.full_name, e.date_of_joining
     FROM employees e
     JOIN users u ON u.id = e.user_id AND u.status = 'ACTIVE'
     WHERE ($1::bigint IS NULL OR e.id = $1)
     ORDER BY e.id`,
    [employeeId ?? null]
  );
  return rows;
}

export async function employeeExists(client, { employeeId }) {
  const { rows } = await client.query('SELECT id FROM employees WHERE id = $1', [employeeId]);
  return rows.length > 0;
}
