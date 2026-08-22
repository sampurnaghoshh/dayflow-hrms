import { ApiError } from '../ApiError.js';
import { store, nextId, requireActor, requireRole, requireSelfOrRole } from './state.js';

function structureFor(employeeId) {
  const versions = store.salaryVersions
    .filter((s) => s.employeeId === employeeId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return {
    current: versions.find((v) => v.effectiveTo === null) ?? null,
    history: versions,
    payslips: store.payslips.filter((p) => p.employeeId === employeeId),
  };
}

export const payrollHandlers = [
  {
    method: 'GET', pattern: '/payroll/me',
    handler: () => structureFor(requireActor().id),
  },
  {
    method: 'GET', pattern: '/payroll/employees/:id',
    handler: ({ id }) => {
      const actor = requireActor();
      requireSelfOrRole(actor, id, ['HR', 'ADMIN']);
      return structureFor(Number(id));
    },
  },
  {
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
          generatedAt: new Date().toISOString(),
          lineItems: version.components.map((c) => ({ code: c.code, label: c.label, kind: c.kind, amount: c.monthlyAmount })),
        };
        store.payslips.push(payslip);
        created.push(payslip);
      });
      return { created: created.length, month };
    },
  },
  {
    method: 'GET', pattern: '/payroll/payslips/:id',
    handler: ({ id }) => {
      const actor = requireActor();
      const payslip = store.payslips.find((p) => p.id === Number(id));
      if (!payslip) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      requireSelfOrRole(actor, payslip.employeeId, ['HR', 'ADMIN']);
      return payslip;
    },
  },
];
