/**
 * SQL only. Every function takes (client, params) and returns rows.
 */

/**
 * §6: unread first.
 *
 * `(read_at IS NULL) DESC` sorts true before false, so everything unread floats to the
 * top and each group stays newest-first within itself. The partial index on
 * (user_id, created_at DESC) WHERE read_at IS NULL serves the unread-only case.
 */
export async function listForUser(client, { userId, unreadOnly, limit, offset }) {
  const { rows } = await client.query(
    `SELECT id, user_id, title, body, link, read_at, created_at,
            COUNT(*) OVER ()::int AS total_count
     FROM notifications
     WHERE user_id = $1
       AND ($2::boolean IS NOT TRUE OR read_at IS NULL)
     ORDER BY (read_at IS NULL) DESC, created_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [userId, unreadOnly, limit, offset]
  );
  return rows;
}

export async function countUnread(client, { userId }) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return rows[0].unread;
}

/**
 * Marks one notification read.
 *
 * user_id is part of the WHERE clause rather than checked afterwards, so one person can
 * never mark another's notification read - and a notification that is not yours is
 * indistinguishable from one that does not exist (§8).
 *
 * `read_at IS NULL` keeps the original timestamp if it is already read, making a repeat
 * click idempotent rather than resetting when it was first seen.
 */
export async function markRead(client, { notificationId, userId }) {
  const { rows } = await client.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2
     RETURNING id, title, read_at, created_at`,
    [notificationId, userId]
  );
  return rows[0] ?? null;
}

/** Recent activity for the employee dashboard (SRS 3.2.1). */
export async function getRecentForUser(client, { userId, limit }) {
  const { rows } = await client.query(
    `SELECT id, title, body, link, read_at, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}
