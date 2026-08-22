/**
 * Every error the API returns on purpose is an AppError.
 *
 * Anything else reaching the error handler is a bug, and is reported as a 500
 * with no internal detail. That split is what lets errorHandler decide, without
 * guessing, which messages are safe to show a user.
 */

/** 'REQUEST_ALREADY_DECIDED' -> 'Request already decided.' */
function humanise(code) {
  const words = String(code).toLowerCase().replaceAll('_', ' ').trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}.` : 'Request failed.';
}

export class AppError extends Error {
  /**
   * @param {number} status  HTTP status (CLAUDE.md §6)
   * @param {string} code    machine-readable, SCREAMING_SNAKE_CASE
   * @param {string} [message] human-readable; derived from `code` when omitted
   * @param {Array<{field: string, issue: string}>} [details]
   */
  constructor(status, code, message, details) {
    super(message ?? humanise(code));
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details?.length) this.details = details;
    // Marks this error as safe to serialise to the client.
    this.expose = true;
    Error.captureStackTrace?.(this, AppError);
  }
}

// Helpers are (code, message?, details?) so the terse form in CLAUDE.md §5.2 works:
//   throw conflict('REQUEST_ALREADY_DECIDED');
const make = (status) => (code, message, details) => new AppError(status, code, message, details);

/** 400 - the request itself is malformed. */
export const badRequest = make(400);
/** 401 - no valid credentials were presented. */
export const unauthorized = make(401);
/** 403 - authenticated, but the wrong role for this route. */
export const forbidden = make(403);
/** 404 - missing, or not yours. §8 uses this instead of 403 so existence never leaks. */
export const notFound = make(404);
/** 409 - conflicts with current state: overlapping leave, a double decide. */
export const conflict = make(409);
/** 422 - well-formed, but a business rule says no. */
export const unprocessable = make(422);

export const isAppError = (err) => err instanceof AppError;
