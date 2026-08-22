/**
 * Input rules for the dashboard module.
 *
 * Both dashboards are role-scoped reads with no parameters of substance - the only
 * inputs are how much recent activity to return. Kept as its own file so every module
 * keeps the same four-file shape (CLAUDE.md §3).
 */
import { z } from 'zod';

export const employeeDashboardQuerySchema = z
  .object({
    activityLimit: z.coerce.number().int().positive().max(50, 'must be 50 or fewer').default(8),
  })
  .strict();

export const adminDashboardQuerySchema = z
  .object({
    recentLimit: z.coerce.number().int().positive().max(50, 'must be 50 or fewer').default(8),
  })
  .strict();
