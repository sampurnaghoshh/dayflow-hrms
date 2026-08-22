/**
 * Input rules for attendance.
 *
 * Note what is absent: there is no timestamp field anywhere. A punch happens when the
 * server says it happens (§1.8), so there is nothing for a client to send.
 */
import { z } from 'zod';

const id = z.coerce.number().int().positive();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'must be a real calendar date');

export const punchSchema = z
  .object({
    direction: z.enum(['IN', 'OUT'], {
      errorMap: () => ({ message: "must be either 'IN' or 'OUT'" }),
    }),
    /**
     * Optional, but a client that retries should always send one: it is what turns a
     * repeated request into a no-op instead of a duplicate punch.
     */
    idempotencyKey: z
      .string()
      .trim()
      .min(8, 'must be at least 8 characters')
      .max(100, 'must be at most 100 characters')
      .optional(),
    source: z.enum(['WEB', 'MOBILE', 'KIOSK']).default('WEB'),
  })
  .strict();

/** from/to default to the current month when the client sends neither. */
export const rangeQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'must be on or after "from"',
  });

export const adminRangeQuerySchema = z
  .object({
    employeeId: id.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(500, 'must be 500 or fewer').default(100),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'must be on or after "from"',
  });

export const recomputeSchema = z
  .object({
    employeeId: id.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'must be on or after "from"',
  });
