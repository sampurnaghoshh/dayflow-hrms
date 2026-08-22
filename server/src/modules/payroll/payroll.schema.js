/**
 * Input rules for payroll.
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

/**
 * Money arrives as a string and stays one all the way to postgres, so it is never
 * parsed into a float on the way in (§1.9). Up to 2 decimal places, matching NUMERIC(12,2).
 */
const money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'must be a positive amount with at most 2 decimals');

const componentSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Z0-9_]+$/, 'must be uppercase letters, digits or underscores')
      .transform((v) => v.toUpperCase()),
    label: z.string().trim().min(1).max(60),
    kind: z.enum(['EARNING', 'DEDUCTION']),
    monthlyAmount: money,
  })
  .strict();

export const createStructureSchema = z
  .object({
    effectiveFrom: isoDate,
    ctcAnnual: money.refine((v) => Number(v) > 0, 'must be greater than zero'),
    /**
     * Optional. Left out, the service derives a conventional breakdown from the CTC and
     * says so in the response, so the demo can post a bare CTC. Supplied, it is used
     * verbatim - the structure is the admin's to define, not this codebase's.
     */
    components: z
      .array(componentSchema)
      .min(1, 'needs at least one component')
      .max(20, 'is limited to 20 components')
      .optional()
      .refine(
        (list) => !list || new Set(list.map((c) => c.code)).size === list.length,
        'must not repeat a component code'
      ),
  })
  .strict();

/** { month: '2026-08' } - a payroll run is per calendar month (§6). */
export const payrollRunSchema = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be a month in YYYY-MM format"),
    employeeId: id.optional(),
  })
  .strict();

export const employeeIdParamSchema = z.object({ id }).strict();
export const payslipIdParamSchema = z.object({ id }).strict();
