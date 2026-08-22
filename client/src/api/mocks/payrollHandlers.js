import { ApiError } from '../ApiError.js';
import { store, nextId, requireActor, requireRole, requireSelfOrRole, money, idStr } from './state.js';

// components[].monthlyAmount is genuinely camelCase in the real response even though every
// sibling field on the salary version itself is snake_case (docs/api-shapes.md) — the
// backend builds this array by hand instead of returning the raw row. Replicated as-is.
function toWireComponent(c) {
  return { code: c.code, label: c.label, kind: c.kind, monthlyAmount: money(c.monthlyAmount) };
}

function toWireVersion(v) {
  return {
    id: idStr(v.id), employee_id: idStr(v.employeeId), effective_from: v.effectiveFrom,
    effective_to: v.effectiveTo, ctc_annual: money(v.ctcAnnual), created_at: v.createdAt,
    created_by_name: v.createdBy, components: v.components.map(toWireComponent),
  };
}

function toWirePayslip(p) {
  return {
    id: idStr(p.id), employee_id: idStr(p.employeeId), period_month: p.periodMonth,
    salary_version_id: idStr(p.salaryVersionId), payable_days: money(p.payableDays),
    lop_days: money(p.lopDays), gross_earnings: money(p.grossEarnings),
    total_deductions: money(p.totalDeductions), net_pay: money(p.netPay), generated_at: p.generatedAt,
  };
}

function structureFor(employeeId) {
  const versions = store.salaryVersions
    .filter((s) => s.employeeId === employeeId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return {
    employeeId: idStr(employeeId),
    current: versions.find((v) => v.effectiveTo === null) ? toWireVersion(versions.find((v) => v.effectiveTo === null)) : null,
    history: versions.map(toWireVersion),
    payslips: store.payslips.filter((p) => p.employeeId === employeeId).map(toWirePayslip),
  };
}

export const payrollHandlers = [
  {
    method: 'GET', pattern: '/payroll/me',
    handler: () => structureFor(requireActor().id),
  },
  {
    // Not separately documented, but Sampurna's GET /payroll/me capture is described as
    // sharing the same shape for "any employee's structure + history" per CLAUDE.md §6.
    method: 'GET', pattern: '/payroll/employees/:id',
    handler: ({ id }) => {
      const actor = requireActor();
      requireSelfOrRole(actor, id, ['HR', 'ADMIN']);
      return structureFor(Number(id));
    },
  },
  {
    // Not in docs/api-shapes.md — extrapolated to return the updated structureFor() shape.
    method: 'POST', pattern: '/payroll/employees/:id/structure',
    handler: ({ id }, { body }) => {
      const actor = requireActor();
      requireRole(actor, ['ADMIN']);
      const employeeId = Number(id);
      const { effectiveFrom, ctcAnnual, components } = body ?? {};
      if (!effectiveFrom || !ctcAnnual || !Array.isArray(components) || !components.length) {
        throw new ApiError('VALIDATION_ERROR', 'Provide an effective date, CTC and at least one component.', [], 422);
      }
      const current = store.salaryVersions.find((s) => s.employeeId === employeeId && s.effectiveTo === null);
      if (current && effectiveFrom <= current.effectiveFrom) {
        throw new ApiError('VALIDATION_ERROR', 'The new structure must start after the current one.', [{ field: 'effectiveFrom', issue: `Choose a date after ${current.effectiveFrom}.` }], 422);
      }
      if (current) current.effectiveTo = effectiveFrom;
      const version = {
        id: nextId('salaryVersion'), employeeId, effectiveFrom, effectiveTo: null,
        ctcAnnual, createdBy: actor.fullName, createdAt: new Date().toISOString(), components,
      };
      store.salaryVersions.push(version);
      return structureFor(employeeId);
    },
  },
  {
    // Not in docs/api-shapes.md — extrapolated.
    method: 'POST', pattern: '/payroll/runs',
    handler: (_params, { body }) => {
      const actor = requireActor();
      requireRole(actor, ['ADMIN']);
      const { month } = body ?? {};
      if (!month) throw new ApiError('VALIDATION_ERROR', 'Choose a month to run payroll for.', [{ field: 'month', issue: 'Required.' }], 400);
      const periodMonth = `${month}-01`;
      const created = [];
      store.employees.filter((e) => e.status === 'ACTIVE').forEach((e) => {
        if (store.payslips.some((p) => p.employeeId === e.id && p.periodMonth === periodMonth)) return; // idempotent
        const version = store.salaryVersions.find((s) => s.employeeId === e.id && s.effectiveTo === null);
        if (!version) return;
        const gross = version.components.filter((c) => c.kind === 'EARNING').reduce((sum, c) => sum + c.monthlyAmount, 0);
        const deductions = version.components.filter((c) => c.kind === 'DEDUCTION').reduce((sum, c) => sum + c.monthlyAmount, 0);
        const payslip = {
          id: nextId('payslip'), employeeId: e.id, periodMonth, salaryVersionId: version.id,
          payableDays: 30, lopDays: 0, grossEarnings: gross, totalDeductions: deductions, netPay: gross - deductions,
          generatedAt: new Date().toISOString(), lineItems: version.components.map((c) => ({ code: c.code, label: c.label, kind: c.kind, amount: c.monthlyAmount })),
        };
        store.payslips.push(payslip);
        created.push(payslip);
      });
      return { created: created.length, month };
    },
  },
  {
    // Not in docs/api-shapes.md — extrapolated (payslip fields + a guessed `lineItems` key).
    // Owner-or-ADMIN only, per CLAUDE.md §6 and Sampurna's note — HR is deliberately excluded,
    // even though HR can read the same figures via GET /payroll/employees/:id.
    method: 'GET', pattern: '/payroll/payslips/:id',
    handler: ({ id }) => {
      const actor = requireActor();
      const payslip = store.payslips.find((p) => p.id === Number(id));
      if (!payslip) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      requireSelfOrRole(actor, payslip.employeeId, ['ADMIN']);
      return {
        ...toWirePayslip(payslip),
        lineItems: (payslip.lineItems ?? []).map((li) => ({ code: li.code, label: li.label, kind: li.kind, amount: money(li.amount) })),
      };
    },
  },
];
