/**
 * validate(schema, 'body' | 'query' | 'params')
 *
 * Every mutating endpoint runs this before touching the database (CLAUDE.md §1.6).
 * On success the parsed value REPLACES req[source], so handlers receive coerced,
 * defaulted, stripped data and never the raw request - there is no path where a
 * route reads an unvalidated field by accident.
 */
import { badRequest } from '../lib/errors.js';

const SOURCES = new Set(['body', 'query', 'params']);

export function validate(schema, source = 'body') {
  if (!SOURCES.has(source)) {
    // Wiring mistake: fail at startup, not on the first request.
    throw new Error(`validate(): source must be body, query or params - got "${source}"`);
  }

  return function validateRequest(req, res, next) {
    const result = schema.safeParse(req[source] ?? {});

    if (!result.success) {
      return next(
        badRequest(
          'VALIDATION_FAILED',
          'Some of the values you sent are not valid.',
          result.error.issues.map((issue) => ({
            field: issue.path.join('.') || source,
            issue: issue.message,
          }))
        )
      );
    }

    req[source] = result.data;
    return next();
  };
}
