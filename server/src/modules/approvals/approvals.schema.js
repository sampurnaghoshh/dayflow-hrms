/**
 * Input rules for the approvals module.
 */
import { z } from 'zod';

const id = z.coerce.number().int().positive();

export const decideSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT'], {
      errorMap: () => ({ message: "must be either 'APPROVE' or 'REJECT'" }),
    }),
    comment: z.string().trim().max(1000, 'must be at most 1000 characters').optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // A rejection is the one outcome the employee cannot act on without being told why,
    // so the reason is mandatory. An approval needs no justification.
    if (value.action === 'REJECT' && !value.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'is required when rejecting a request',
      });
    }
  });

export const stepIdParamSchema = z.object({ stepId: id }).strict();

export const queueQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100, 'must be 100 or fewer').default(20),
  })
  .strict();
