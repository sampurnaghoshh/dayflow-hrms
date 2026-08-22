import { ApiError } from '../ApiError.js';
import { store, nextId, requireActor, requireRole, requireSelfOrRole, paginate, idStr } from './state.js';

// Not in docs/api-shapes.md — extrapolated to match the same snake_case-row convention
// confirmed for leave/attendance/payroll (CLAUDE.md §4's `employees` columns are snake_case).
const SELF_EDITABLE_FIELDS = ['phone', 'address'];

function findEmployeeOr404(id) {
  const employee = store.employees.find((e) => e.id === Number(id));
  if (!employee) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
  return employee;
}

function toWireEmployee(e) {
  const dept = store.departments.find((d) => d.id === e.departmentId) ?? null;
  return {
    id: idStr(e.id), employee_code: e.employeeCode, full_name: e.fullName, email: e.email,
    role: e.role, status: e.status, department_id: idStr(e.departmentId),
    department: dept ? { id: idStr(dept.id), code: dept.code, name: dept.name } : null,
    manager_id: idStr(e.managerId), designation: e.designation, date_of_joining: e.dateOfJoining,
    phone: e.phone, address: e.address, profile_photo_path: e.profilePhotoPath,
  };
}

function toWireDocument(d) {
  return {
    id: idStr(d.id), employee_id: idStr(d.employeeId), doc_type: d.docType,
    original_name: d.originalName, mime_type: d.mimeType, size_bytes: d.sizeBytes,
    uploaded_at: d.uploadedAt,
  };
}

export const employeeHandlers = [
  {
    method: 'GET', pattern: '/employees',
    handler: (_params, { query }) => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);
      let rows = [...store.employees];
      if (query?.q) {
        const q = query.q.toLowerCase();
        rows = rows.filter((e) => e.fullName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
      }
      if (query?.departmentId) rows = rows.filter((e) => e.departmentId === Number(query.departmentId));
      const { data, page, pageSize, total } = paginate(rows, query?.page, query?.pageSize ?? 20);
      return { data: data.map(toWireEmployee), page, pageSize, total };
    },
  },
  {
    method: 'GET', pattern: '/employees/:id',
    handler: ({ id }) => {
      const actor = requireActor();
      requireSelfOrRole(actor, id, ['HR', 'ADMIN']);
      const employee = findEmployeeOr404(id);
      const currentSalary = store.salaryVersions.find((s) => s.employeeId === employee.id && s.effectiveTo === null);
      return {
        ...toWireEmployee(employee),
        documents: store.employeeDocuments.filter((d) => d.employeeId === employee.id).map(toWireDocument),
        currentSalary: currentSalary ? { id: idStr(currentSalary.id), ctc_annual: String(currentSalary.ctcAnnual.toFixed(2)) } : null,
      };
    },
  },
  {
    method: 'PATCH', pattern: '/employees/:id',
    handler: ({ id }, { body }) => {
      const actor = requireActor();
      requireSelfOrRole(actor, id, ['ADMIN']);
      const employee = findEmployeeOr404(id);
      // Role-gated, not self-vs-other: CLAUDE.md §6 reads "self (limited) / ADMIN (all)" — an
      // ADMIN editing their own profile still gets every field, matching what /profile shows.
      const isAdmin = actor.role === 'ADMIN';
      const fields = Object.keys(body ?? {});
      if (!isAdmin) {
        const disallowed = fields.filter((f) => !SELF_EDITABLE_FIELDS.includes(f));
        if (disallowed.length) {
          throw new ApiError('VALIDATION_ERROR', 'You can only update your phone and address.', disallowed.map((f) => ({ field: f, issue: 'Not editable by employees.' })), 422);
        }
      }
      Object.assign(employee, body);
      return toWireEmployee(employee);
    },
  },
  {
    method: 'POST', pattern: '/employees/:id/photo',
    handler: ({ id }, { body }) => {
      const actor = requireActor();
      requireSelfOrRole(actor, id, ['ADMIN']);
      const employee = findEmployeeOr404(id);
      const file = body instanceof FormData ? body.get('photo') : null;
      if (!file || !['image/jpeg', 'image/png'].includes(file.type)) {
        throw new ApiError('VALIDATION_ERROR', 'Upload a JPEG or PNG under 2MB.', [{ field: 'photo', issue: 'Unsupported file type.' }], 422);
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new ApiError('VALIDATION_ERROR', 'That photo is larger than 2MB.', [{ field: 'photo', issue: 'Choose a smaller file.' }], 422);
      }
      employee.profilePhotoPath = URL.createObjectURL(file);
      return { profilePhotoPath: employee.profilePhotoPath };
    },
  },
  {
    method: 'GET', pattern: '/employees/:id/documents',
    handler: ({ id }) => {
      const actor = requireActor();
      requireSelfOrRole(actor, id, ['HR', 'ADMIN']);
      findEmployeeOr404(id);
      return { data: store.employeeDocuments.filter((d) => d.employeeId === Number(id)).map(toWireDocument) };
    },
  },
  {
    method: 'POST', pattern: '/employees/:id/documents',
    handler: ({ id }, { body }) => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);
      const employee = findEmployeeOr404(id);
      const file = body instanceof FormData ? body.get('file') : null;
      const docType = body instanceof FormData ? body.get('docType') : null;
      if (!file || !docType) {
        throw new ApiError('VALIDATION_ERROR', 'Choose a document type and a file.', [], 422);
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new ApiError('VALIDATION_ERROR', 'That file is larger than 5MB.', [{ field: 'file', issue: 'Choose a smaller file.' }], 422);
      }
      const doc = {
        id: nextId('document'), employeeId: employee.id, docType,
        originalName: file.name, mimeType: file.type, sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
      };
      store.employeeDocuments.push(doc);
      return toWireDocument(doc);
    },
  },
  {
    method: 'GET', pattern: '/documents/:id/download',
    handler: ({ id }) => {
      const actor = requireActor();
      const doc = store.employeeDocuments.find((d) => d.id === Number(id));
      if (!doc) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      requireSelfOrRole(actor, doc.employeeId, ['HR', 'ADMIN']);
      return toWireDocument(doc);
    },
  },
];
