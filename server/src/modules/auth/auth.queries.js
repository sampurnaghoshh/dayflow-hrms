/**
 * SQL only. Every function takes (client, params) and returns rows.
 * No business logic, no req/res, no transactions - the service owns those.
 */

export async function insertUser(client, { employeeCode, email, passwordHash }) {
  const { rows } = await client.query(
    `INSERT INTO users (employee_code, email, password_hash, role, status)
     VALUES ($1, $2, $3, 'EMPLOYEE', 'PENDING_VERIFICATION')
     RETURNING id, employee_code, email, role, status, created_at`,
    [employeeCode, email, passwordHash]
  );
  return rows[0];
}

/**
 * departmentCode is resolved inside the statement rather than with a prior SELECT,
 * so there is no window between the lookup and the insert.
 */
export async function insertEmployee(
  client,
  { userId, fullName, departmentCode, designation, dateOfJoining, phone, address }
) {
  const { rows } = await client.query(
    `INSERT INTO employees (user_id, full_name, department_id, designation, date_of_joining, phone, address)
     VALUES ($1, $2, (SELECT id FROM departments WHERE code = $3), $4, $5, $6, $7)
     RETURNING id, user_id, full_name, department_id, designation, date_of_joining, phone, address`,
    [userId, fullName, departmentCode ?? null, designation ?? null, dateOfJoining, phone ?? null, address ?? null]
  );
  return rows[0];
}

/**
 * Grants the opening leave balance, pro-rated across the months remaining in the
 * joining year and capped at annual_cap.
 *
 * The WHERE clause is load-bearing twice over:
 *   - delta <> 0 is a CHECK constraint on the ledger, so a zero row would be rejected;
 *   - v_leave_balances already reports 0.00 for an (employee, type) pair that has no
 *     rows at all, so a zero row would carry no information anyway.
 * UNPAID accrues 0/month and therefore never gets an OPENING row.
 *
 * created_by is NULL on purpose: no human granted this, policy did. The note records why.
 */
export async function insertOpeningLedgerRows(client, { employeeId, dateOfJoining }) {
  const { rows } = await client.query(
    `INSERT INTO leave_balance_ledger (employee_id, leave_type_id, delta, reason, note, created_by)
     SELECT $1,
            lt.id,
            opening.delta,
            'OPENING',
            'Opening balance on registration, pro-rated from date of joining',
            NULL
     FROM leave_types lt
     CROSS JOIN LATERAL (
       SELECT ROUND(
                LEAST(
                  lt.accrual_per_month * GREATEST(0, LEAST(12,
                    CASE WHEN EXTRACT(YEAR FROM $2::date) = EXTRACT(YEAR FROM CURRENT_DATE)
                         THEN 13 - EXTRACT(MONTH FROM $2::date)
                         ELSE 12
                    END)),
                  COALESCE(lt.annual_cap, 999999)
                ), 2) AS delta
     ) AS opening
     WHERE lt.is_active
       AND opening.delta <> 0
     RETURNING leave_type_id, delta`,
    [employeeId, dateOfJoining]
  );
  return rows;
}

export async function insertVerificationToken(client, { userId, tokenHash, expiresAt }) {
  const { rows } = await client.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, expires_at`,
    [userId, tokenHash, expiresAt]
  );
  return rows[0];
}

/**
 * Locks the token row so two clicks on the same verification link cannot both
 * pass the "not yet consumed" test.
 */
export async function findLiveVerificationToken(client, { tokenHash }) {
  const { rows } = await client.query(
    `SELECT t.id, t.user_id, t.expires_at, t.consumed_at, u.status
     FROM email_verification_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1
     FOR UPDATE OF t`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function consumeVerificationToken(client, { id }) {
  const { rows } = await client.query(
    `UPDATE email_verification_tokens
     SET consumed_at = now()
     WHERE id = $1 AND consumed_at IS NULL
     RETURNING id`,
    [id]
  );
  return rows[0] ?? null;
}

export async function activateUser(client, { userId }) {
  const { rows } = await client.query(
    `UPDATE users
     SET status = 'ACTIVE', email_verified_at = now()
     WHERE id = $1
     RETURNING id, email, role, status, email_verified_at`,
    [userId]
  );
  return rows[0] ?? null;
}

/** Returns the password hash too - only the service ever sees it. */
export async function findUserByEmail(client, { email }) {
  const { rows } = await client.query(
    `SELECT u.id, u.employee_code, u.email, u.password_hash, u.role, u.status,
            e.id AS employee_id
     FROM users u
     LEFT JOIN employees e ON e.user_id = u.id
     WHERE u.email = $1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function touchLastLogin(client, { userId }) {
  await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
}

/** Powers GET /auth/me: current user + employee + role (§6). */
export async function findAuthContext(client, { userId }) {
  const { rows } = await client.query(
    `SELECT u.id            AS user_id,
            u.employee_code,
            u.email,
            u.role,
            u.status,
            u.email_verified_at,
            u.last_login_at,
            e.id            AS employee_id,
            e.full_name,
            e.designation,
            e.date_of_joining,
            e.phone,
            e.address,
            e.profile_photo_path,
            e.manager_id,
            d.id            AS department_id,
            d.code          AS department_code,
            d.name          AS department_name
     FROM users u
     LEFT JOIN employees e   ON e.user_id = u.id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}
