/**
 * All input rules for the auth module. Nothing reaches the database that has not
 * been through one of these (CLAUDE.md §1.6).
 */
import { z } from 'zod';

/**
 * §8: at least 8 characters, one uppercase, one lowercase, one digit.
 * Each rule is a separate refinement so the error tells the user which one failed
 * instead of restating the whole policy.
 */
export const passwordSchema = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(200, 'must be at most 200 characters')
  .refine((v) => /[A-Z]/.test(v), 'must contain an uppercase letter')
  .refine((v) => /[a-z]/.test(v), 'must contain a lowercase letter')
  .refine((v) => /[0-9]/.test(v), 'must contain a digit');

const emailSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .max(254, 'is too long')
  .email('must be a valid email address')
  // Stored as CITEXT, so comparison is case-insensitive anyway. Lowercasing keeps
  // what we display consistent with what the user typed at sign-up.
  .toLowerCase();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'must be a real calendar date');

export const registerSchema = z
  .object({
    // Assigned by HR, entered by the employee at sign-up. users.employee_code is
    // UNIQUE NOT NULL with no default, so a collision surfaces as EMPLOYEE_CODE_TAKEN.
    employeeCode: z
      .string()
      .trim()
      .min(3, 'must be at least 3 characters')
      .max(12, 'must be at most 12 characters')
      .regex(/^[A-Za-z0-9-]+$/, 'may contain only letters, numbers and hyphens')
      .transform((v) => v.toUpperCase()),
    email: emailSchema,
    password: passwordSchema,
    fullName: z.string().trim().min(2, 'is required').max(120, 'is too long'),
    departmentCode: z.string().trim().min(1).max(10).toUpperCase().optional(),
    designation: z.string().trim().max(120).optional(),
    dateOfJoining: isoDate,
    phone: z.string().trim().max(20).optional(),
    address: z.string().trim().max(500).optional(),
  })
  .strict();

export const verifyQuerySchema = z
  .object({
    token: z.string().trim().min(1, 'is required').max(200, 'is not a valid token'),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    // Deliberately NOT passwordSchema: the policy applies when choosing a password,
    // not when presenting one. Validating strength here would tell an attacker that
    // a rejected guess did not even meet the rules, and would lock out any account
    // created before the policy changed.
    password: z.string().min(1, 'is required').max(200, 'is too long'),
  })
  .strict();
