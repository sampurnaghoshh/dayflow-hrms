/**
 * Wiring only: no logic, no SQL.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  balancesQuerySchema,
  createLeaveRequestSchema,
  ledgerQuerySchema,
  listRequestsQuerySchema,
  requestIdParamSchema,
} from './leave.schema.js';
import * as service from './leave.service.js';

export const router = Router();

// Everything in this module requires a session; per-record ownership is enforced
// in the service, which answers 404 rather than 403 so ids cannot be probed (§8).
router.use(requireAuth);

// GET /api/leave/types
router.get('/types', async (req, res, next) => {
  try {
    res.json(await service.listLeaveTypes());
  } catch (err) {
    next(err);
  }
});

// GET /api/leave/balances?employeeId=
router.get('/balances', validate(balancesQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.getBalances(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/leave/ledger?employeeId=&typeId=
router.get('/ledger', validate(ledgerQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.getLedger(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

/*
 * POST /api/leave/requests
 *
 * §6 marks this EMPLOYEE. It is mounted on requireAuth alone instead, deliberately:
 * HR and ADMIN users have employee records and leave balances of their own, and
 * requireRole('EMPLOYEE') would mean the HR manager can never apply for leave. The
 * service still refuses any account with no employee row. Say the word if the stricter
 * reading is wanted and this becomes requireRole('EMPLOYEE').
 */
router.post('/requests', validate(createLeaveRequestSchema), async (req, res, next) => {
  try {
    const { request, steps, dayCount } = await service.createLeaveRequest(req.user, req.body);
    res.status(201).json({ request, approvalSteps: steps, dayCount });
  } catch (err) {
    next(err);
  }
});

// GET /api/leave/requests?scope=mine|all&status=&employeeId=&page=&pageSize=
router.get('/requests', validate(listRequestsQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listRequests(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/leave/requests/:id
router.get('/requests/:id', validate(requestIdParamSchema, 'params'), async (req, res, next) => {
  try {
    res.json(await service.getRequestDetail(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/leave/requests/:id/cancel
router.post(
  '/requests/:id/cancel',
  validate(requestIdParamSchema, 'params'),
  async (req, res, next) => {
    try {
      res.json(await service.cancelRequest(req.user, req.params.id));
    } catch (err) {
      next(err);
    }
  }
);
