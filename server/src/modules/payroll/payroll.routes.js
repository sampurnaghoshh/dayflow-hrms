/**
 * Wiring only: no logic, no SQL.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  createStructureSchema,
  employeeIdParamSchema,
  payrollRunSchema,
  payslipIdParamSchema,
} from './payroll.schema.js';
import * as service from './payroll.service.js';

export const router = Router();

router.use(requireAuth);

// GET /api/payroll/me - SRS 3.6.1, read-only for the employee
router.get('/me', async (req, res, next) => {
  try {
    res.json(await service.getPayrollFor(req.user, null));
  } catch (err) {
    next(err);
  }
});

// GET /api/payroll/employees/:id - HR/ADMIN see any employee's structure and history
router.get(
  '/employees/:id',
  requireRole('HR', 'ADMIN'),
  validate(employeeIdParamSchema, 'params'),
  async (req, res, next) => {
    try {
      res.json(await service.getPayrollFor(req.user, req.params.id));
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/payroll/employees/:id/structure - SRS 3.6.2, ADMIN only
router.post(
  '/employees/:id/structure',
  requireRole('ADMIN'),
  validate(employeeIdParamSchema, 'params'),
  validate(createStructureSchema),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createStructure(req.user, req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/payroll/runs - ADMIN only, idempotent per (employee, month)
router.post('/runs', requireRole('ADMIN'), validate(payrollRunSchema), async (req, res, next) => {
  try {
    res.json(await service.runPayroll(req.user, req.body));
  } catch (err) {
    next(err);
  }
});

// GET /api/payroll/payslips/:id - owner or ADMIN (§6)
router.get('/payslips/:id', validate(payslipIdParamSchema, 'params'), async (req, res, next) => {
  try {
    res.json(await service.getPayslip(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});
