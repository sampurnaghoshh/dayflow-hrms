import { ApiError } from '../ApiError.js';
import { store, requireActor, requireRole } from './state.js';

function inRange(row, from, to) {
  return (!from || row.workDate >= from) && (!to || row.workDate <= to);
}

function weeklyRollup(days) {
  const weeks = new Map();
  days.forEach((d) => {
    const dt = new Date(`${d.workDate}T00:00:00`);
    const weekStart = new Date(dt);
    weekStart.setDate(dt.getDate() - dt.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    const entry = weeks.get(key) ?? { weekStart: key, workedMinutes: 0, present: 0, absent: 0, halfDay: 0 };
    entry.workedMinutes += d.workedMinutes;
    if (d.status === 'PRESENT') entry.present += 1;
    if (d.status === 'ABSENT') entry.absent += 1;
    if (d.status === 'HALF_DAY') entry.halfDay += 1;
    weeks.set(key, entry);
  });
  return [...weeks.values()];
}

export const attendanceHandlers = [
  {
    method: 'POST', pattern: '/attendance/punch',
    handler: (_params, { body }) => {
      const actor = requireActor();
      requireRole(actor, ['EMPLOYEE', 'HR', 'ADMIN']);
      const { direction } = body ?? {};
      if (!['IN', 'OUT'].includes(direction)) {
        throw new ApiError('VALIDATION_ERROR', 'Punch direction must be IN or OUT.', [{ field: 'direction', issue: 'Required.' }], 400);
      }
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      let day = store.attendanceDays.find((d) => d.employeeId === actor.id && d.workDate === today);
      if (!day) {
        day = { employeeId: actor.id, workDate: today, status: 'PRESENT', workedMinutes: 0, firstIn: null, lastOut: null };
        store.attendanceDays.push(day);
      }
      if (direction === 'IN' && !day.firstIn) day.firstIn = now.toISOString();
      if (direction === 'OUT') day.lastOut = now.toISOString();
      return { direction, punchAt: now.toISOString() };
    },
  },
  {
    method: 'GET', pattern: '/attendance/me',
    handler: (_params, { query }) => {
      const actor = requireActor();
      const days = store.attendanceDays.filter((d) => d.employeeId === actor.id && inRange(d, query?.from, query?.to));
      return { data: days, weekly: weeklyRollup(days) };
    },
  },
  {
    method: 'GET', pattern: '/attendance',
    handler: (_params, { query }) => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);
      let rows = store.attendanceDays.filter((d) => inRange(d, query?.from, query?.to));
      if (query?.employeeId) rows = rows.filter((d) => d.employeeId === Number(query.employeeId));
      return { data: rows };
    },
  },
  {
    method: 'GET', pattern: '/attendance/today',
    handler: () => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);
      return { data: store.todayPresence };
    },
  },
  {
    method: 'POST', pattern: '/attendance/recompute',
    handler: () => {
      const actor = requireActor();
      requireRole(actor, ['ADMIN']);
      return { recomputed: true, at: new Date().toISOString() };
    },
  },
];
