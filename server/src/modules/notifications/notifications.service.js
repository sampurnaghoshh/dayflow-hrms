/**
 * Notifications business logic. No req, no res, no SQL.
 */
import { pool } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import * as q from './notifications.queries.js';

/** GET /notifications - unread first, with the badge count alongside. */
export async function listNotifications(actor, { unreadOnly, page, pageSize }) {
  const rows = await q.listForUser(pool, {
    userId: actor.id,
    unreadOnly,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const total = rows.length > 0 ? rows[0].total_count : 0;

  return {
    data: rows.map(({ total_count, ...row }) => row),
    unread: await q.countUnread(pool, { userId: actor.id }),
    page,
    pageSize,
    total,
  };
}

/**
 * POST /notifications/:id/read - owner only.
 *
 * Ownership is enforced inside the UPDATE's WHERE clause, so somebody else's
 * notification and a nonexistent one produce the same 404.
 */
export async function markRead(actor, notificationId) {
  const updated = await q.markRead(pool, { notificationId, userId: actor.id });
  if (!updated) throw notFound('NOTIFICATION_NOT_FOUND', 'No notification with that id.');

  return { notification: updated, unread: await q.countUnread(pool, { userId: actor.id }) };
}

/** Used by the employee dashboard for its recent-activity feed. */
export function getRecent(userId, limit) {
  return q.getRecentForUser(pool, { userId, limit });
}
