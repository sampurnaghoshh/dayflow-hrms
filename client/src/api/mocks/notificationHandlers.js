import { ApiError } from '../ApiError.js';
import { store, requireActor } from './state.js';

export const notificationHandlers = [
  {
    method: 'GET', pattern: '/notifications',
    handler: () => {
      const actor = requireActor();
      const rows = store.notifications
        .filter((n) => n.userId === actor.userId)
        .sort((a, b) => (a.readAt ? 1 : 0) - (b.readAt ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
      return { data: rows };
    },
  },
  {
    method: 'POST', pattern: '/notifications/:id/read',
    handler: ({ id }) => {
      const actor = requireActor();
      const note = store.notifications.find((n) => n.id === Number(id));
      if (!note || note.userId !== actor.userId) throw new ApiError('NOT_FOUND', 'Not found.', [], 404);
      note.readAt = new Date().toISOString();
      return note;
    },
  },
];
