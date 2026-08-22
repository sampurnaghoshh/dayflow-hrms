/**
 * Wiring only: no logic, no SQL.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from './notifications.schema.js';
import * as service from './notifications.service.js';

export const router = Router();

router.use(requireAuth);

// GET /api/notifications?unreadOnly=&page=&pageSize=
router.get('/', validate(listNotificationsQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listNotifications(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/read - owner only
router.post('/:id/read', validate(notificationIdParamSchema, 'params'), async (req, res, next) => {
  try {
    res.json(await service.markRead(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});
