/**
 * SQL only. Every function takes (client, params) and returns rows.
 */

/**
 * Paginated directory with search (§6 `?q=&departmentId=&page=`).
 *
 * The search is a case-insensitive substring across name, employee code and
 * designation. $1 is bound as a parameter and only ever concatenated with % inside
 * postgres - it is never interpolated into the SQL text (§1.5).
 */
export async function listEmployees(client, { q, departmentId, limit, offset }) {
  const { rows } = await client.query(
    `SELECT e.id,
            e.full_name,
            e.designation,
            e.date_of_joining,
            e.phone,
            e.profile_photo_path,
            u.id            AS user_id,
            u.employee_code,
            u.email,
            u.role,
            u.status,
            d.id            AS department_id,
            d.code          AS department_code,
            d.name          AS department_name,
            m.full_name     AS manager_name,
            COUNT(*) OVER ()::int AS total_count
     FROM employees e
     JOIN users u            ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees m   ON m.id = e.manager_id
     WHERE ($1::text IS NULL
            OR e.full_name ILIKE '%' || $1 || '%'
            OR u.employee_code ILIKE '%' || $1 || '%'
            OR e.designation ILIKE '%' || $1 || '%')
       AND ($2::bigint IS NULL OR e.department_id = $2)
     ORDER BY e.full_name, e.id
     LIMIT $3 OFFSET $4`,
    [q ?? null, departmentId ?? null, limit, offset]
  );
  return rows;
}

export async function getEmployeeById(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT e.id,
            e.user_id,
            e.full_name,
            e.designation,
            e.date_of_joining,
            e.phone,
            e.address,
            e.profile_photo_path,
            e.manager_id,
            m.full_name     AS manager_name,
            u.employee_code,
            u.email,
            u.role,
            u.status,
            d.id            AS department_id,
            d.code          AS department_code,
            d.name          AS department_name
     FROM employees e
     JOIN users u            ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees m   ON m.id = e.manager_id
     WHERE e.id = $1`,
    [employeeId]
  );
  return rows[0] ?? null;
}

/** The salary summary shown on the detail screen (SRS 3.3.1) - current version only. */
export async function getCurrentSalarySummary(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT v.id, v.effective_from, ROUND(v.ctc_annual, 2)::text AS ctc_annual,
            ROUND(v.ctc_annual / 12, 2)::text AS monthly_gross
     FROM employee_salary_versions v
     WHERE v.employee_id = $1 AND v.effective_to IS NULL`,
    [employeeId]
  );
  return rows[0] ?? null;
}

/**
 * The limited edit an employee may make to their own record (SRS 3.3.2).
 * The column list is the guarantee: this statement cannot change a salary, a
 * department or a role no matter what the request body contained.
 */
export async function updateOwnContactDetails(client, { employeeId, phone, address }) {
  const { rows } = await client.query(
    `UPDATE employees
     SET phone   = COALESCE($2, phone),
         address = COALESCE($3, address)
     WHERE id = $1
     RETURNING id, full_name, phone, address`,
    [employeeId, phone ?? null, address ?? null]
  );
  return rows[0] ?? null;
}

/** The full edit, ADMIN only. COALESCE leaves any field the request omitted alone. */
export async function updateEmployeeAsAdmin(
  client,
  { employeeId, fullName, departmentId, managerId, designation, dateOfJoining, phone, address }
) {
  const { rows } = await client.query(
    `UPDATE employees
     SET full_name       = COALESCE($2, full_name),
         department_id   = COALESCE($3, department_id),
         manager_id      = COALESCE($4, manager_id),
         designation     = COALESCE($5, designation),
         date_of_joining = COALESCE($6::date, date_of_joining),
         phone           = COALESCE($7, phone),
         address         = COALESCE($8, address)
     WHERE id = $1
     RETURNING id, full_name, department_id, manager_id, designation,
               date_of_joining, phone, address`,
    [
      employeeId,
      fullName ?? null,
      departmentId ?? null,
      managerId ?? null,
      designation ?? null,
      dateOfJoining ?? null,
      phone ?? null,
      address ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function setProfilePhoto(client, { employeeId, storedPath }) {
  const { rows } = await client.query(
    `UPDATE employees SET profile_photo_path = $2 WHERE id = $1
     RETURNING id, profile_photo_path`,
    [employeeId, storedPath]
  );
  return rows[0] ?? null;
}

export async function departmentExists(client, { departmentId }) {
  const { rows } = await client.query('SELECT id FROM departments WHERE id = $1', [departmentId]);
  return rows.length > 0;
}

export async function employeeExists(client, { employeeId }) {
  const { rows } = await client.query('SELECT id FROM employees WHERE id = $1', [employeeId]);
  return rows.length > 0;
}

// --- documents --------------------------------------------------------------

export async function insertDocument(
  client,
  { employeeId, docType, originalName, storedPath, mimeType, sizeBytes, uploadedBy }
) {
  const { rows } = await client.query(
    `INSERT INTO employee_documents
       (employee_id, doc_type, original_name, stored_path, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, employee_id, doc_type, original_name, mime_type, size_bytes, uploaded_at`,
    [employeeId, docType, originalName, storedPath, mimeType, sizeBytes, uploadedBy]
  );
  return rows[0];
}

/** stored_path is deliberately not selected - it never needs to reach a client. */
export async function listDocuments(client, { employeeId }) {
  const { rows } = await client.query(
    `SELECT d.id, d.employee_id, d.doc_type, d.original_name, d.mime_type, d.size_bytes,
            d.uploaded_at, e.full_name AS uploaded_by_name
     FROM employee_documents d
     LEFT JOIN users u     ON u.id = d.uploaded_by
     LEFT JOIN employees e ON e.user_id = u.id
     WHERE d.employee_id = $1
     ORDER BY d.uploaded_at DESC`,
    [employeeId]
  );
  return rows;
}

/** Includes stored_path, because the download route is the one caller that needs it. */
export async function getDocumentForDownload(client, { documentId }) {
  const { rows } = await client.query(
    `SELECT id, employee_id, doc_type, original_name, stored_path, mime_type, size_bytes
     FROM employee_documents
     WHERE id = $1`,
    [documentId]
  );
  return rows[0] ?? null;
}

export async function getPhotoPath(client, { employeeId }) {
  const { rows } = await client.query(
    'SELECT profile_photo_path FROM employees WHERE id = $1',
    [employeeId]
  );
  return rows[0]?.profile_photo_path ?? null;
}
