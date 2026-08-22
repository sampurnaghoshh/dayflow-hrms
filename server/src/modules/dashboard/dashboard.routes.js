/**
 * Wiring only: no logic, no SQL.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { adminDashboardQuerySchema, employeeDashboardQuerySchema } from './dashboard.schema.js';
import * as service from './dashboard.service.js';

export const router = Router();

router.use(requireAuth);

/*
 * GET /api/dashboard/employee - SRS 3.2.1
 *
 * requireAuth rather than requireRole('EMPLOYEE'), consistent with the leave and
 * attendance modules: HR and ADMIN are employees too and have their own balances,
 * attendance and notifications to look at.
 */
router.get('/employee', validate(employeeDashboardQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.getEmployeeDashboard(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/admin - SRS 3.2.2, HR/ADMIN only
router.get(
  '/admin',
  requireRole('HR', 'ADMIN'),
  validate(adminDashboardQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      res.json(await service.getAdminDashboard(req.user, req.query));
    } catch (err) {
      next(err);
    }
  }
);
