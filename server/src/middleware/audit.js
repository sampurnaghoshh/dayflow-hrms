/**
 * writeAudit(client, {...}) - the append-only record of who changed what.
 *
 * audit_log is the third append-only table in this system, alongside the leave ledger
 * and the punch tape. Balances are auditable because the ledger explains them; profile
 * and salary changes are auditable because of this.
 *
 * Takes a client rather than reaching for the pool, so the audit row lands inside the
 * same transaction as the change it describes. An audit entry for a change that rolled
 * back would be worse than no entry at all.
 */

/**
 * @param {import('pg').PoolClient} client
 * @param {object} entry
 * @param {string|number|null} entry.actorUserId
 * @param {string} entry.entity        'employee', 'employee_document', ...
 * @param {string|number|null} entry.entityId
 * @param {string} entry.action        'UPDATE', 'UPLOAD_PHOTO', ...
 * @param {object|null} [entry.before]
 * @param {object|null} [entry.after]
 * @param {string|null} [entry.ipAddress]
 */
export async function writeAudit(
  client,
  { actorUserId, entity, entityId, action, before = null, after = null, ipAddress = null }
) {
  const { rows } = await client.query(
    `INSERT INTO audit_log (actor_user_id, entity, entity_id, action, before_state, after_state, ip_address)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::inet)
     RETURNING id, created_at`,
    [
      actorUserId ?? null,
      entity,
      entityId ?? null,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      normaliseIp(ipAddress),
    ]
  );
  return rows[0];
}

/**
 * The column is INET, which rejects anything that is not an address. Express reports
 * IPv4-mapped IPv6 for local connections ('::ffff:127.0.0.1'), which postgres does
 * accept, but an unparseable value would abort the surrounding transaction - so
 * anything doubtful becomes NULL rather than taking the real change down with it.
 */
function normaliseIp(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'unknown') return null;
  return trimmed;
}

/** Only the fields that actually changed, so the log reads as a diff. */
export function changedFields(before, after) {
  const changes = { before: {}, after: {} };
  for (const key of Object.keys(after)) {
    if (String(before?.[key] ?? '') !== String(after[key] ?? '')) {
      changes.before[key] = before?.[key] ?? null;
      changes.after[key] = after[key] ?? null;
    }
  }
  return Object.keys(changes.after).length > 0 ? changes : null;
}
