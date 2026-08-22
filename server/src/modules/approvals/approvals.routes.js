/**
 * Wiring only: no logic, no SQL.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { decideSchema, queueQuerySchema, stepIdParamSchema } from './approvals.schema.js';
import * as service from './approvals.service.js';

export const router = Router();

// Both routes are HR/ADMIN only, checked server-side (§8). The finer question of which
// individual steps a given role may act on is answered in the service.
router.use(requireAuth, requireRole('HR', 'ADMIN'));

// GET /api/approvals/queue
router.get('/queue', validate(queueQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.getQueue(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

// POST /api/approvals/steps/:stepId/decide   { action: 'APPROVE'|'REJECT', comment }
router.post(
  '/steps/:stepId/decide',
  validate(stepIdParamSchema, 'params'),
  validate(decideSchema),
  async (req, res, next) => {
    try {
      res.json(await service.decideStep(req.user, req.params.stepId, req.body));
    } catch (err) {
      next(err);
    }
  }
);
