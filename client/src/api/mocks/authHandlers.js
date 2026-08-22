import { ApiError } from '../ApiError.js';
import {
  store, nextId, setSession, clearSession, currentEmployee, requireActor,
  issueVerifyToken, consumeVerifyToken, idStr,
} from './state.js';

// Wire shapes for POST /auth/login and GET /auth/me come from docs/api-shapes.md — they are
// NOT the same shape (that's the mismatch AuthContext.jsx has to handle). login's `user` is
// flat with an `employeeId`; me's `user` has no employeeId but a separate nested `employee`
// (with its own `department`), both nullable if the user has no employee row yet.
function toLoginUser(employee) {
  return {
    id: idStr(employee.userId),
    employeeCode: employee.employeeCode,
    email: employee.email,
    role: employee.role,
    status: employee.status,
    employeeId: idStr(employee.id),
  };
}

function toMeUser(employee) {
  return {
    id: idStr(employee.userId),
    employeeCode: employee.employeeCode,
    email: employee.email,
    role: employee.role,
    status: employee.status,
    emailVerifiedAt: employee.emailVerifiedAt,
    lastLoginAt: employee.lastLoginAt,
  };
}

// Nullable per docs/api-shapes.md (a user can in principle exist without an employee row
// yet) — doesn't happen in this mock's data model since register always creates both.
function toMeEmployee(employee) {
  const dept = store.departments.find((d) => d.id === employee.departmentId) ?? null;
  return {
    id: idStr(employee.id),
    fullName: employee.fullName,
    designation: employee.designation,
    dateOfJoining: employee.dateOfJoining,
    phone: employee.phone,
    address: employee.address,
    profilePhotoPath: employee.profilePhotoPath,
    managerId: idStr(employee.managerId),
    department: dept ? { id: idStr(dept.id), code: dept.code, name: dept.name } : null,
  };
}

export const authHandlers = [
  {
    // Response shape isn't captured in docs/api-shapes.md (only login/me were) — this is a
    // reasonable extrapolation of the same conventions, not verified ground truth.
    method: 'POST', pattern: '/auth/register',
    handler: (_params, { body }) => {
      const { employeeCode, email, password, role = 'EMPLOYEE' } = body ?? {};
      if (!employeeCode || !email || !password) {
        throw new ApiError('VALIDATION_ERROR', 'Please fill in every field.', [], 400);
      }
      if (store.employees.some((e) => e.email.toLowerCase() === String(email).toLowerCase())) {
        throw new ApiError('EMAIL_TAKEN', 'An account with this email already exists.', [{ field: 'email', issue: 'Use a different email or sign in instead.' }], 422);
      }
      const userId = nextId('employee');
      const employee = {
        id: userId, userId, employeeCode, fullName: employeeCode, email, role,
        status: 'PENDING_VERIFICATION', departmentId: null, departmentName: null,
        managerId: null, managerName: null, designation: null,
        dateOfJoining: new Date().toISOString().slice(0, 10), phone: null, address: null,
        profilePhotoPath: null, emailVerifiedAt: null, lastLoginAt: null,
      };
      store.employees.push(employee);
      store.mockCredentials.push({ email, password, userId });
      const token = issueVerifyToken(userId);
      // Anti-goal: no real email sending. The mock hands back the link directly so the UI
      // can show it; the real backend will need an equivalent stand-in until SMTP exists.
      return { id: idStr(employee.id), employeeCode, email, status: employee.status, verificationUrl: `/verify-email?token=${token}` };
    },
  },
  {
    method: 'GET', pattern: '/auth/verify',
    handler: (_params, { query }) => {
      const userId = consumeVerifyToken(query?.token);
      if (!userId) throw new ApiError('INVALID_TOKEN', 'This verification link is invalid or has expired.', [], 400);
      const employee = store.employees.find((e) => e.userId === userId);
      if (!employee) throw new ApiError('INVALID_TOKEN', 'This verification link is invalid or has expired.', [], 400);
      employee.status = 'ACTIVE';
      employee.emailVerifiedAt = new Date().toISOString();
      return { status: employee.status };
    },
  },
  {
    method: 'POST', pattern: '/auth/login',
    handler: (_params, { body }) => {
      const { email, password } = body ?? {};
      const cred = store.mockCredentials.find((c) => c.email.toLowerCase() === String(email).toLowerCase());
      if (!cred || cred.password !== password) {
        throw new ApiError('INVALID_CREDENTIALS', 'Email or password is incorrect.', [], 401);
      }
      const employee = store.employees.find((e) => e.userId === cred.userId);
      if (employee.status === 'PENDING_VERIFICATION') {
        throw new ApiError('EMAIL_NOT_VERIFIED', 'Please verify your email before signing in.', [], 403);
      }
      if (employee.status === 'DISABLED') {
        throw new ApiError('ACCOUNT_DISABLED', 'This account has been disabled. Contact HR.', [], 403);
      }
      setSession(cred.userId);
      employee.lastLoginAt = new Date().toISOString();
      return { user: toLoginUser(employee) };
    },
  },
  {
    method: 'POST', pattern: '/auth/logout',
    handler: () => {
      clearSession();
      return null;
    },
  },
  {
    method: 'GET', pattern: '/auth/me',
    handler: () => {
      const employee = requireActor();
      return { user: toMeUser(employee), employee: toMeEmployee(employee) };
    },
  },
];
