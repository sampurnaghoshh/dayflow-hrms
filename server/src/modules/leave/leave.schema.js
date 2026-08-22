/**
 * Input rules for the leave module.
 *
 * These cover shape and format only. The business rules from §5.1 - end on or after
 * start, start not in the past, both dates in one calendar year, enough balance -
 * live in the service and return 422, because they are policy decisions rather than
 * malformed input (§6).
 */
import { z } from 'zod';

/** BIGINT primary keys. Numbers are exact in JS below 2^53, far beyond any id here. */
const id = z.coerce.number().int().positive();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'must be a real calendar date');

export const createLeaveRequestSchema = z
  .object({
    leaveTypeId: id,
    startDate: isoDate,
    endDate: isoDate,
    remarks: z.string().trim().max(500, 'must be at most 500 characters').optional(),
  })
  .strict();

export const listRequestsQuerySchema = z
  .object({
    // 'all' is honoured only for HR and ADMIN; the service downgrades it otherwise.
    scope: z.enum(['mine', 'all']).default('mine'),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
    employeeId: id.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100, 'must be 100 or fewer').default(20),
  })
  .strict();

export const balancesQuerySchema = z
  .object({
    // Absent means "mine". Supplying someone else's id requires HR or ADMIN.
    employeeId: id.optional(),
  })
  .strict();

export const ledgerQuerySchema = z
  .object({
    employeeId: id.optional(),
    typeId: id.optional(),
  })
  .strict();

export const requestIdParamSchema = z.object({ id }).strict();
