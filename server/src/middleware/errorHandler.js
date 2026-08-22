/**
 * The single exit point for every failed request, and the only place in the
 * codebase that writes a 5xx (CLAUDE.md §3).
 *
 * Emits exactly one error shape (CLAUDE.md §6):
 *   { "error": { "code": "...", "message": "...", "details": [ { field, issue } ] } }
 */
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

/**
 * Database constraints are a real part of this system's validation, so when one
 * fires we translate it into the same vocabulary the rest of the API uses rather
 * than leaking "conflicting key value violates exclusion constraint ...".
 */
const CONSTRAINT_ERRORS = {
  no_overlapping_live_leave: {
    status: 409,
    code: 'LEAVE_DATES_OVERLAP',
    message: 'You already have a pending or approved leave request covering those dates.',
  },
  no_overlapping_salary: {
    status: 409,
    code: 'SALARY_VERSION_OVERLAP',
    message: 'A salary structure is already active for part of that period.',
  },
  users_email_key: {
    status: 409,
    code: 'EMAIL_ALREADY_REGISTERED',
    message: 'An account with that email address already exists.',
  },
  users_employee_code_key: {
    status: 409,
    code: 'EMPLOYEE_CODE_TAKEN',
    message: 'That employee code is already in use.',
  },
  payslips_employee_id_period_month_key: {
    status: 409,
    code: 'PAYSLIP_ALREADY_GENERATED',
    message: 'A payslip already exists for that employee and month.',
  },
};

const zodDetails = (err) =>
  err.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    issue: issue.message,
  }));

/**
 * Normalises anything thrown anywhere into { status, code, message, details, internal }.
 * `internal` marks errors whose text must never reach the client.
 */
function normalise(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }

  // A ZodError escaping validate() means a service parsed something itself.
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Some of the values you sent are not valid.',
      details: zodDetails(err),
    };
  }

  // Postgres errors carry a SQLSTATE in err.code.
  if (typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
    const known = CONSTRAINT_ERRORS[err.constraint];
    if (known) return known;

    // 23P01 exclusion violation, 23505 unique violation: both mean "conflicts with
    // state that already exists", which is a 409 (CLAUDE.md §6).
    if (err.code === '23P01') {
      return {
        status: 409,
        code: 'EXCLUSION_CONFLICT',
        message: 'That change conflicts with an existing record.',
      };
    }
    if (err.code === '23505') {
      return {
        status: 409,
        code: 'ALREADY_EXISTS',
        message: 'That record already exists.',
      };
    }

    // 23503 foreign key violation: the client referenced a row that does not exist -
    // a leave_type_id or department_id that is well-formed but points at nothing.
    // That is bad input, not a server fault, so it is a 422 (CLAUDE.md §6).
    if (err.code === '23503') {
      return {
        status: 422,
        code: 'REFERENCED_RECORD_NOT_FOUND',
        message: 'One of the records you referenced does not exist.',
      };
    }

    // Every other SQLSTATE - CHECK violations, undefined columns, type errors -
    // means our own validation let something through. That is a bug on our side,
    // so it stays a 500 and stays loud, rather than being dressed up as a 4xx.
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong on our end.',
    internal: true,
  };
}

/** Mount after all routes, before errorHandler. Turns unmatched paths into a 404. */
export function notFoundHandler(req, res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Cannot ${req.method} ${req.path}`));
}

// Express identifies error middleware by arity: all four parameters are required.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const { status, code, message, details, internal } = normalise(err);

  // SSE and file downloads may already be streaming; Express must close those itself.
  if (res.headersSent) return next(err);

  // Stack traces are for us, never for production logs shipped elsewhere (§8).
  if (internal || status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} ->`, env.isProduction ? err.message : err);
  } else if (!env.isProduction) {
    console.warn(`[warn] ${req.method} ${req.originalUrl} -> ${status} ${code}`);
  }

  const body = { error: { code, message } };
  if (details?.length) body.error.details = details;
  res.status(status).json(body);
}
