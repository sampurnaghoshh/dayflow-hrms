// Thrown by client.js for every non-2xx response (real or mocked). Shape mirrors
// CLAUDE.md §6's error envelope: { error: { code, message, details } }.
export class ApiError extends Error {
  constructor(code, message, details = [], status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}
