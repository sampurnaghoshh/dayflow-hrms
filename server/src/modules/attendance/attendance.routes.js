/**
 * Wiring only: no logic, no SQL.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  adminRangeQuerySchema,
  punchSchema,
  rangeQuerySchema,
  recomputeSchema,
} from './attendance.schema.js';
import * as service from './attendance.service.js';

export const router = Router();

router.use(requireAuth);

/*
 * POST /api/attendance/punch
 *
 * Mounted on requireAuth rather than requireRole('EMPLOYEE'), for the same reason as
 * POST /leave/requests: HR and ADMIN are employees too and have to be able to check in.
 * The service refuses any account with no employee record.
 */
router.post('/punch', validate(punchSchema), async (req, res, next) => {
  try {
    const result = await service.punch(req.user, req.body);
    // 200 rather than 201 on a replayed idempotency key: nothing new was created.
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/me?from=&to=   - SRS 3.4.1
router.get('/me', validate(rangeQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.getMyAttendance(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/today  - live presence board
router.get('/today', requireRole('HR', 'ADMIN'), async (req, res, next) => {
  try {
    res.json(await service.getTodayBoard());
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/recompute  - ADMIN only, rebuilds derived state from punches
router.post(
  '/recompute',
  requireRole('ADMIN'),
  validate(recomputeSchema),
  async (req, res, next) => {
    try {
      res.json(await service.recompute(req.user, req.body));
    } catch (err) {
      next(err);
    }
  }
);

/*
 * GET /api/attendance?employeeId=&from=&to=  - SRS 3.4.2
 *
 * Declared last: '/me', '/today' and '/recompute' are literal paths on the same router
 * and must be matched before this catch-all range query.
 */
router.get(
  '/',
  requireRole('HR', 'ADMIN'),
  validate(adminRangeQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      res.json(await service.getAllAttendance(req.user, req.query));
    } catch (err) {
      next(err);
    }
  }
);
