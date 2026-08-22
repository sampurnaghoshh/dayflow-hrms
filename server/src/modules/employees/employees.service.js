/**
 * Employees business logic and transactions. No req, no res, no SQL.
 */
import { unlink } from 'node:fs/promises';
import { pool, withTransaction } from '../../db/pool.js';
import { forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { changedFields, writeAudit } from '../../middleware/audit.js';
import { resolveStoredPath } from '../../middleware/upload.js';
import { SELF_EDITABLE_FIELDS } from './employees.schema.js';
import * as q from './employees.queries.js';

const PRIVILEGED_ROLES = new Set(['HR', 'ADMIN']);
const isPrivileged = (actor) => PRIVILEGED_ROLES.has(actor.role);
const isAdmin = (actor) => actor.role === 'ADMIN';
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Read access to one employee: yourself, or HR/ADMIN.
 *
 * A denial is 404 rather than 403 so an employee walking /employees/1..100 learns
 * nothing about who exists (§8).
 */
function assertCanRead(actor, employeeId) {
  if (sameId(employeeId, actor.employeeId) || isPrivileged(actor)) return;
  throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
}

export async function listEmployees(actor, { q: search, departmentId, page, pageSize }) {
  const rows = await q.listEmployees(pool, {
    q: search,
    departmentId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const total = rows.length > 0 ? rows[0].total_count : 0;
  return { data: rows.map(({ total_count, ...row }) => row), page, pageSize, total };
}

/** Profile + job + salary summary + documents (SRS 3.3.1). */
export async function getEmployee(actor, employeeId) {
  assertCanRead(actor, employeeId);

  const employee = await q.getEmployeeById(pool, { employeeId });
  if (!employee) throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');

  const [salary, documents] = await Promise.all([
    q.getCurrentSalarySummary(pool, { employeeId }),
    q.listDocuments(pool, { employeeId }),
  ]);

  return { employee, salary, documents };
}

/**
 * PATCH /employees/:id - the role branch (SRS 3.3.2).
 *
 * ADMIN may change anything on anyone. Everybody else may change phone and address, and
 * only on their own record. Sending a field you may not change is refused outright
 * rather than quietly dropped: silently ignoring half a request is how a UI comes to
 * believe it saved something it did not.
 *
 * The two paths run different SQL statements - updateOwnContactDetails names only phone
 * and address in its SET clause - so the restriction survives even if this branch is
 * ever got wrong.
 */
export async function updateEmployee(actor, employeeId, body) {
  const editingSelf = sameId(employeeId, actor.employeeId);

  if (!editingSelf && !isAdmin(actor)) {
    // HR can read this person, so 403 tells them nothing they did not already know.
    // Anyone else cannot, so they get the same 404 they would get for a stranger id.
    if (isPrivileged(actor)) {
      throw forbidden('EMPLOYEE_NOT_EDITABLE', 'Only an administrator can edit another employee.');
    }
    throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
  }

  if (!isAdmin(actor)) {
    const forbiddenFields = Object.keys(body).filter((f) => !SELF_EDITABLE_FIELDS.includes(f));
    if (forbiddenFields.length > 0) {
      throw forbidden(
        'FIELD_NOT_EDITABLE',
        `You may only change ${SELF_EDITABLE_FIELDS.join(' and ')} on your own profile.`,
        forbiddenFields.map((f) => ({ field: f, issue: 'Only an administrator can change this' }))
      );
    }
  }

  return withTransaction(async (client) => {
    const before = await q.getEmployeeById(client, { employeeId });
    if (!before) throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');

    if (isAdmin(actor)) {
      if (body.departmentId != null && !(await q.departmentExists(client, { departmentId: body.departmentId }))) {
        throw unprocessable('DEPARTMENT_NOT_FOUND', 'No department with that id.', [
          { field: 'departmentId', issue: 'Not a known department' },
        ]);
      }
      if (body.managerId != null) {
        if (sameId(body.managerId, employeeId)) {
          // no_self_manage would also reject this, but a CHECK violation surfaces as a
          // 500 by design - our own validation is supposed to catch it first.
          throw unprocessable('MANAGER_IS_SELF', 'An employee cannot be their own manager.', [
            { field: 'managerId', issue: 'Choose a different manager' },
          ]);
        }
        if (!(await q.employeeExists(client, { employeeId: body.managerId }))) {
          throw unprocessable('MANAGER_NOT_FOUND', 'No employee with that manager id.', [
            { field: 'managerId', issue: 'Not a known employee' },
          ]);
        }
      }
    }

    const after = isAdmin(actor)
      ? await q.updateEmployeeAsAdmin(client, { employeeId, ...body })
      : await q.updateOwnContactDetails(client, { employeeId, ...body });

    const diff = changedFields(before, after);
    if (diff) {
      await writeAudit(client, {
        actorUserId: actor.id,
        entity: 'employee',
        entityId: employeeId,
        action: 'UPDATE',
        before: diff.before,
        after: diff.after,
        ipAddress: actor.ipAddress,
      });
    }

    return { employee: after, changed: diff?.after ? Object.keys(diff.after) : [] };
  });
}

/** Removes an uploaded file that its database row never got written for. */
async function discard(file) {
  if (file?.path) await unlink(file.path).catch(() => {});
}

/** POST /employees/:id/photo - self or ADMIN. */
export async function setProfilePhoto(actor, employeeId, file) {
  if (!sameId(employeeId, actor.employeeId) && !isAdmin(actor)) {
    await discard(file);
    if (isPrivileged(actor)) {
      throw forbidden('PHOTO_NOT_EDITABLE', "Only an administrator can change another employee's photo.");
    }
    throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
  }

  try {
    return await withTransaction(async (client) => {
      const before = await q.getPhotoPath(client, { employeeId });
      const updated = await q.setProfilePhoto(client, {
        employeeId,
        storedPath: file.relativePath,
      });
      if (!updated) throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');

      await writeAudit(client, {
        actorUserId: actor.id,
        entity: 'employee',
        entityId: employeeId,
        action: 'UPLOAD_PHOTO',
        before: { profilePhotoPath: before },
        after: { profilePhotoPath: updated.profile_photo_path },
        ipAddress: actor.ipAddress,
      });

      // The previous photo is left on disk on purpose: an audit row points at it, and
      // deleting the thing a log entry refers to defeats the point of logging it.
      return { employeeId: String(employeeId), profilePhotoPath: updated.profile_photo_path };
    });
  } catch (err) {
    await discard(file);
    throw err;
  }
}

/** GET /employees/:id/documents - self or HR/ADMIN. */
export async function listDocuments(actor, employeeId) {
  assertCanRead(actor, employeeId);
  if (!(await q.employeeExists(pool, { employeeId }))) {
    throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
  }
  return { employeeId: String(employeeId), documents: await q.listDocuments(pool, { employeeId }) };
}

/** POST /employees/:id/documents - HR/ADMIN only (§6). */
export async function addDocument(actor, employeeId, { docType }, file) {
  try {
    return await withTransaction(async (client) => {
      if (!(await q.employeeExists(client, { employeeId }))) {
        throw notFound('EMPLOYEE_NOT_FOUND', 'No employee with that id.');
      }

      const document = await q.insertDocument(client, {
        employeeId,
        docType,
        // Kept as a label for the download filename. Never used to address the disk.
        originalName: file.originalname,
        storedPath: file.relativePath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: actor.id,
      });

      await writeAudit(client, {
        actorUserId: actor.id,
        entity: 'employee_document',
        entityId: document.id,
        action: 'UPLOAD',
        after: { employeeId: String(employeeId), docType, originalName: file.originalname },
        ipAddress: actor.ipAddress,
      });

      return document;
    });
  } catch (err) {
    await discard(file);
    throw err;
  }
}

/**
 * GET /documents/:id/download - resolves the file only after the ownership check.
 * Returns metadata; the route does the streaming.
 */
export async function getDownloadTarget(actor, documentId) {
  const document = await q.getDocumentForDownload(pool, { documentId });

  if (!document || (!sameId(document.employee_id, actor.employeeId) && !isPrivileged(actor))) {
    throw notFound('DOCUMENT_NOT_FOUND', 'No document with that id.');
  }

  return { document, absolutePath: resolveStoredPath(document.stored_path) };
}

/** GET /employees/:id/photo - same audience as the profile it belongs to. */
export async function getPhotoTarget(actor, employeeId) {
  assertCanRead(actor, employeeId);

  const storedPath = await q.getPhotoPath(pool, { employeeId });
  if (!storedPath) throw notFound('PHOTO_NOT_FOUND', 'That employee has no profile photo.');

  return {
    absolutePath: resolveStoredPath(storedPath),
    mimeType: storedPath.endsWith('.png') ? 'image/png' : 'image/jpeg',
  };
}
