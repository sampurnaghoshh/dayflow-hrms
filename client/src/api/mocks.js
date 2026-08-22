// Mock adapter for CLAUDE.md §6. client.js calls mockRequest() instead of fetch() whenever
// VITE_USE_MOCKS !== 'false', so every page can be built and clicked through before the
// real server exists. Route handlers live in ./mocks/*Handlers.js, grouped by module.
import { ApiError } from './ApiError.js';
import { delay, matchPath } from './mocks/state.js';
import { authHandlers } from './mocks/authHandlers.js';
import { employeeHandlers } from './mocks/employeeHandlers.js';
import { leaveHandlers } from './mocks/leaveHandlers.js';
import { approvalHandlers } from './mocks/approvalHandlers.js';
import { attendanceHandlers } from './mocks/attendanceHandlers.js';
import { payrollHandlers } from './mocks/payrollHandlers.js';
import { dashboardHandlers } from './mocks/dashboardHandlers.js';
import { notificationHandlers } from './mocks/notificationHandlers.js';

const routes = [
  ...authHandlers,
  ...employeeHandlers,
  ...leaveHandlers,
  ...approvalHandlers,
  ...attendanceHandlers,
  ...payrollHandlers,
  ...dashboardHandlers,
  ...notificationHandlers,
];

export async function mockRequest(method, path, { body, query } = {}) {
  await delay();
  const route = routes.find((r) => r.method === method && matchPath(r.pattern, path));
  if (!route) {
    throw new ApiError('NOT_FOUND', `No mock is wired for ${method} ${path}.`, [], 404);
  }
  const params = matchPath(route.pattern, path);
  return route.handler(params, { body, query });
}
