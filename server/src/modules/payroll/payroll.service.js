/**
 * Payroll business logic and transactions. No req, no res, no SQL.
 */
import { pool, withTransaction } from '../../db/pool.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { businessDaysBetween } from '../../lib/dates.js';
import * as q from './payroll.queries.js';
import * as leaveQ from '../leave/leave.queries.js';

const PRIVILEGED_ROLES = new Set(['HR', 'ADMIN']);
const isPrivileged = (actor) => PRIVILEGED_ROLES.has(actor.role);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// --- exact money -------------------------------------------------------------
// Amounts are handled as integer paise in BigInt, never as Number. 0.1 + 0.2 is not
// 0.3 in binary floating point, and a salary breakdown is exactly the place where
// that shows up as a rupee going missing (§1.9).

/** '12000.50' -> 1200050n */
function toPaise(value) {
  const [whole, frac = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2));
}

/** 1200050n -> '12000.50' */
function fromPaise(paise) {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

const percent = (paise, pct) => (paise * BigInt(pct)) / 100n;

/**
 * A conventional Indian breakdown, used only when the admin does not supply components.
 *
 * SPECIAL is whatever is left rather than a third percentage, so the earnings always
 * total the monthly gross exactly instead of drifting by a paisa through rounding.
 * This is a convenience default, not policy hidden in code: it is reported back as
 * `derivedComponents: true`, and any supplied structure overrides it entirely.
 */
function deriveComponents(ctcAnnual) {
  const monthlyGross = toPaise(ctcAnnual) / 12n;
  const basic = percent(monthlyGross, 40);
  const hra = percent(basic, 50);
  const special = monthlyGross - basic - hra;
  const pf = percent(basic, 12);
  const professionalTax = 20000n; // a flat 200.00

  return [
    { code: 'BASIC', label: 'Basic Salary', kind: 'EARNING', monthlyAmount: fromPaise(basic) },
    { code: 'HRA', label: 'House Rent Allowance', kind: 'EARNING', monthlyAmount: fromPaise(hra) },
    { code: 'SPECIAL', label: 'Special Allowance', kind: 'EARNING', monthlyAmount: fromPaise(special) },
    { code: 'PF', label: 'Provident Fund', kind: 'DEDUCTION', monthlyAmount: fromPaise(pf) },
    { code: 'PT', label: 'Professional Tax', kind: 'DEDUCTION', monthlyAmount: fromPaise(professionalTax) },
  ];
}

function resolveEmployeeId(actor, requested) {
  if (requested == null) {
    if (!actor.employeeId) {
      throw notFound('EMPLOYEE_NOT_FOUND', 'This account has no employee record.');
    }
    return actor.employeeId;
  }
  if (sameId(requested, actor.employeeId) || isPrivileged(actor)) return requested;
  throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
}

/** Groups components onto the versions they belong to. */
async function withComponents(client, versions) {
  const components = await q.getComponentsForVersions(client, {
    versionIds: versions.map((v) => v.id),
  });
  const byVersion = new Map();
  for (const c of components) {
    if (!byVersion.has(c.salary_version_id)) byVersion.set(c.salary_version_id, []);
    byVersion.get(c.salary_version_id).push({
      code: c.code,
      label: c.label,
      kind: c.kind,
      monthlyAmount: c.monthly_amount,
    });
  }
  return versions.map((v) => ({ ...v, components: byVersion.get(v.id) ?? [] }));
}

/** GET /payroll/me and GET /payroll/employees/:id - SRS 3.6.1, read-only. */
export async function getPayrollFor(actor, requestedEmployeeId) {
  const employeeId = resolveEmployeeId(actor, requestedEmployeeId);

  const versions = await withComponents(pool, await q.getSalaryVersions(pool, { employeeId }));
  const payslips = await q.getPayslipsForEmployee(pool, { employeeId });

  return {
    employeeId: String(employeeId),
    current: versions.find((v) => v.effective_to === null) ?? null,
    history: versions,
    payslips,
  };
}

/**
 * POST /payroll/employees/:id/structure - SRS 3.6.2.
 *
 * Closing the old version and opening the new one happen in ONE transaction. Halfway
 * through, the employee would either have two open structures or none; the
 * no_overlapping_salary exclusion constraint would reject the first, and the second
 * would silently take them off payroll.
 */
export async function createStructure(actor, employeeId, { effectiveFrom, ctcAnnual, components }) {
  return withTransaction(async (client) => {
    if (!(await q.employeeExists(client, { employeeId }))) {
      throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
    }

    const open = await q.lockOpenSalaryVersion(client, { employeeId });

    if (open && effectiveFrom <= open.effective_from) {
      throw unprocessable(
        'SALARY_VERSION_NOT_LATER',
        `The current structure starts on ${open.effective_from}. A revision has to start after that.`,
        [{ field: 'effectiveFrom', issue: `Must be later than ${open.effective_from}` }]
      );
    }

    const derived = !components;
    const finalComponents = components ?? deriveComponents(ctcAnnual);

    // Earnings define the monthly gross, so they have to agree with the CTC being
    // recorded. Without this a payslip could quietly pay something the structure
    // does not claim.
    const expectedGross = fromPaise(toPaise(ctcAnnual) / 12n);
    const actualGross = await q.sumEarnings(client, {
      amounts: finalComponents.map((c) => c.monthlyAmount),
      kinds: finalComponents.map((c) => c.kind),
    });

    if (toPaise(actualGross) !== toPaise(expectedGross)) {
      throw unprocessable(
        'COMPONENTS_DO_NOT_MATCH_CTC',
        `The earning components total ${actualGross} but a month of ${ctcAnnual} is ${expectedGross}.`,
        [{ field: 'components', issue: `Earnings must sum to ${expectedGross}` }]
      );
    }

    // '[)' validity means the old version stops claiming the day the new one starts.
    if (open) {
      await q.closeSalaryVersion(client, { versionId: open.id, effectiveTo: effectiveFrom });
    }

    // Any overlap with an older CLOSED version is caught by no_overlapping_salary and
    // surfaces as 409 SALARY_VERSION_OVERLAP.
    const version = await q.insertSalaryVersion(client, {
      employeeId,
      effectiveFrom,
      ctcAnnual,
      createdBy: actor.id,
    });

    const written = await q.insertSalaryComponents(client, {
      versionId: version.id,
      codes: finalComponents.map((c) => c.code),
      labels: finalComponents.map((c) => c.label),
      kinds: finalComponents.map((c) => c.kind),
      amounts: finalComponents.map((c) => c.monthlyAmount),
    });

    return {
      version,
      components: written,
      closedVersionId: open?.id ?? null,
      derivedComponents: derived,
      monthlyGross: expectedGross,
    };
  });
}

/** First and last day of a 'YYYY-MM' month. */
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    first: `${month}-01`,
    last: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * POST /payroll/runs - generates payslips for a month.
 *
 * Idempotent by construction: payslips carries UNIQUE (employee_id, period_month) and
 * the insert is ON CONFLICT DO NOTHING, so running August twice produces August once.
 * That matters because a payroll run is exactly the kind of thing someone re-clicks
 * when a page seems slow.
 */
export async function runPayroll(actor, { month, employeeId }) {
  const { first, last } = monthBounds(month);
  const todayMonthStart = `${new Date().toISOString().slice(0, 7)}-01`;

  if (first > todayMonthStart) {
    throw unprocessable(
      'PAYROLL_MONTH_IN_FUTURE',
      'That month has not started yet, so there is nothing to pay.',
      [{ field: 'month', issue: `Must be ${todayMonthStart.slice(0, 7)} or earlier` }]
    );
  }

  return withTransaction(async (client) => {
    const holidays = await leaveQ.getHolidaysBetween(client, { start: first, end: last });
    const workingDays = businessDaysBetween(
      first,
      last,
      holidays.map((h) => h.holiday_date)
    );

    if (workingDays === 0) {
      throw unprocessable('PAYROLL_NO_WORKING_DAYS', 'That month contains no working days.');
    }

    const employees = await q.listPayableEmployees(client, { employeeId: employeeId ?? null });
    if (employeeId && employees.length === 0) {
      throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
    }

    const created = [];
    const alreadyExisted = [];
    const skipped = [];

    for (const employee of employees) {
      // The structure they end the month on. Someone hired mid-month has a version
      // that starts mid-month, and it is in force by the last day.
      const version = await q.getSalaryVersionOn(client, { employeeId: employee.id, onDate: last });

      if (!version) {
        skipped.push({
          employeeId: String(employee.id),
          fullName: employee.full_name,
          reason: 'NO_SALARY_STRUCTURE',
        });
        continue;
      }

      const lopDays = await q.getLopDays(client, { employeeId: employee.id, periodMonth: first });
      const payableDays = Math.max(0, workingDays - lopDays);

      const payslip = await q.insertPayslip(client, {
        employeeId: employee.id,
        periodMonth: first,
        versionId: version.id,
        payableDays,
        lopDays,
        workingDays,
        generatedBy: actor.id,
      });

      if (!payslip) {
        alreadyExisted.push({ employeeId: String(employee.id), fullName: employee.full_name });
        continue;
      }

      await q.insertPayslipLineItems(client, {
        payslipId: payslip.id,
        versionId: version.id,
        payableDays,
        workingDays,
      });

      created.push({ ...payslip, fullName: employee.full_name });
    }

    return {
      month,
      periodMonth: first,
      workingDays,
      considered: employees.length,
      created,
      alreadyExisted,
      skipped,
    };
  });
}

/**
 * GET /payroll/payslips/:id
 *
 * §6 scopes this to "owner or ADMIN" - note HR is not on that list, even though HR can
 * read the same figures through GET /payroll/employees/:id. Following the contract as
 * written; say the word if HR should be added.
 */
export async function getPayslip(actor, payslipId) {
  const payslip = await q.getPayslipById(pool, { payslipId });

  const isOwner = payslip && sameId(payslip.employee_id, actor.employeeId);
  if (!payslip || !(isOwner || actor.role === 'ADMIN')) {
    throw notFound('PAYSLIP_NOT_FOUND', 'No payslip with that id.');
  }

  const lineItems = await q.getPayslipLineItems(pool, { payslipId });
  return { payslip, lineItems };
}
