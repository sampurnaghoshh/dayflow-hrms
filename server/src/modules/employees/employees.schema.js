/**
 * Input rules for the employees module.
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

export const listEmployeesQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(80).optional(),
    departmentId: id.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100, 'must be 100 or fewer').default(20),
  })
  .strict();

/**
 * Every field is optional, and the role branch in the service decides which of them the
 * caller is actually allowed to send. Zod's job here is shape; permission is not a
 * shape question, and answering it here would put the policy in two places.
 */
export const patchEmployeeSchema = z
  .object({
    // Anyone may change these two on their own record (SRS 3.3.2).
    phone: z.string().trim().max(20, 'is too long').optional(),
    address: z.string().trim().max(500, 'is too long').optional(),

    // ADMIN only.
    fullName: z.string().trim().min(2, 'is too short').max(120, 'is too long').optional(),
    departmentId: id.optional(),
    managerId: id.optional(),
    designation: z.string().trim().max(120, 'is too long').optional(),
    dateOfJoining: isoDate.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'must contain at least one field to change');

/** Which fields a non-admin may send for their own record. */
export const SELF_EDITABLE_FIELDS = Object.freeze(['phone', 'address']);

export const documentUploadSchema = z
  .object({
    docType: z.enum(['ID_PROOF', 'OFFER_LETTER', 'CERTIFICATE', 'OTHER']).default('OTHER'),
  })
  .strict();

export const employeeIdParamSchema = z.object({ id }).strict();
export const documentIdParamSchema = z.object({ id }).strict();
