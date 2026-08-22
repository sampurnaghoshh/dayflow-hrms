import { ApiError } from '../ApiError.js';
import { store, nextId, requireActor, requireRole, requireSelfOrRole, paginate } from './state.js';

const SELF_EDITABLE_FIELDS = ['phone', 'address'];

function findEmployeeOr404(id) {
  const employee = store.employees.find((e) => e.id === Number(id));
  if (!employee) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
  return employee;
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
      return paginate(rows, query?.page, query?.pageSize ?? 20);
    },
  },
  {
    method: 'GET', pattern: '/employees/:id',
    handler: ({ id }) => {
      const actor = requireActor();
      requireSelfOrRole(actor, id, ['HR', 'ADMIN']);
      const employee = findEmployeeOr404(id);
      return {
        ...employee,
        documents: store.employeeDocuments.filter((d) => d.employeeId === employee.id),
        currentSalary: store.salaryVersions.find((s) => s.employeeId === employee.id && s.effectiveTo === null) ?? null,
      };
    },
  },
  {
    method: 'PATCH', pattern: '/employees/:id',
    handler: ({ id }, { body }) => {
      const actor = requireActor();
      requireSelfOrRole(actor, id, ['ADMIN']);
      const employee = findEmployeeOr404(id);
      const isAdmin = actor.role === 'ADMIN' && actor.id !== employee.id;
      const fields = Object.keys(body ?? {});
      if (!isAdmin) {
        const disallowed = fields.filter((f) => !SELF_EDITABLE_FIELDS.includes(f));
        if (disallowed.length) {
          throw new ApiError('VALIDATION_ERROR', 'You can only update your phone and address.', disallowed.map((f) => ({ field: f, issue: 'Not editable by employees.' })), 422);
        }
      }
      Object.assign(employee, body);
      return { ...employee };
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
      return { data: store.employeeDocuments.filter((d) => d.employeeId === Number(id)) };
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
      return doc;
    },
  },
  {
    method: 'GET', pattern: '/documents/:id/download',
    handler: ({ id }) => {
      const actor = requireActor();
      const doc = store.employeeDocuments.find((d) => d.id === Number(id));
      if (!doc) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      requireSelfOrRole(actor, doc.employeeId, ['HR', 'ADMIN']);
      return doc;
    },
  },
];
