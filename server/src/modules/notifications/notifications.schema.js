/**
 * Input rules for notifications.
 */
import { z } from 'zod';

const id = z.coerce.number().int().positive();

export const listNotificationsQuerySchema = z
  .object({
    // Unread-only, for a badge or a filtered view.
    unreadOnly: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100, 'must be 100 or fewer').default(20),
  })
  .strict();

export const notificationIdParamSchema = z.object({ id }).strict();
