import { ApiError } from '../ApiError.js';
import {
  store, nextId, setSession, clearSession, currentEmployee, requireActor,
  issueVerifyToken, consumeVerifyToken,
} from './state.js';

function toMe(employee) {
  const { userId, ...rest } = employee;
  return rest;
}

export const authHandlers = [
  {
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
        profilePhotoPath: null,
      };
      store.employees.push(employee);
      store.mockCredentials.push({ email, password, userId });
      issueVerifyToken(userId);
      return { id: employee.id, employeeCode, email, status: employee.status };
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
      return toMe(employee);
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
    handler: () => toMe(requireActor()),
  },
];
