import { ApiError } from '../ApiError.js';
import { store, requireActor, requireRole, idStr, emitStreamEvent } from './state.js';

function inRange(row, from, to) {
  return (!from || row.workDate >= from) && (!to || row.workDate <= to);
}

function toWireDay(d) {
  return {
    employee_id: idStr(d.employeeId), work_date: d.workDate, status: d.status,
    worked_minutes: d.workedMinutes, first_in: d.firstIn, last_out: d.lastOut,
    leave_request_id: idStr(d.leaveRequestId ?? null), computed_at: d.computedAt ?? new Date().toISOString(),
    leave_code: d.leaveCode ?? null,
  };
}

// GET /api/attendance/me is captured in docs/api-shapes.md — this weekly shape (week_start/
// present_days/half_days/absent_days/leave_days/non_working_days) matches it exactly.
function weeklyRollup(days) {
  const weeks = new Map();
  days.forEach((d) => {
    const dt = new Date(`${d.workDate}T00:00:00`);
    const weekStart = new Date(dt);
    weekStart.setDate(dt.getDate() - dt.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    const entry = weeks.get(key) ?? {
      week_start: key, worked_minutes: 0, present_days: 0, half_days: 0,
      absent_days: 0, leave_days: 0, non_working_days: 0,
    };
    entry.worked_minutes += d.workedMinutes;
    if (d.status === 'PRESENT') entry.present_days += 1;
    else if (d.status === 'HALF_DAY') entry.half_days += 1;
    else if (d.status === 'ABSENT') entry.absent_days += 1;
    else if (d.status === 'ON_LEAVE') entry.leave_days += 1;
    else if (d.status === 'WEEKEND' || d.status === 'HOLIDAY') entry.non_working_days += 1;
    weeks.set(key, entry);
  });
  return [...weeks.values()];
}

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export const attendanceHandlers = [
  {
    // SSE `attendance:punch` (docs/api-shapes.md) uses this same shape — kept identical here
    // since the real endpoint most plausibly returns what it broadcasts.
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

      // Keep the live presence board (GET /attendance/today) in sync — otherwise a punch
      // updates attendanceDays but the "today" screen never sees it, live or not.
      let presence = store.todayPresence.find((p) => p.employeeId === actor.id);
      if (!presence) {
        presence = { employeeId: actor.id, employeeName: actor.fullName, departmentName: null, status: day.status, firstIn: null, lastOut: null };
        store.todayPresence.push(presence);
      }
      presence.status = day.status;
      presence.firstIn = day.firstIn;
      presence.lastOut = day.lastOut;

      const payload = {
        employeeId: idStr(actor.id), direction, punchAt: now.toISOString(),
        workDate: day.workDate, status: day.status, workedMinutes: day.workedMinutes,
      };
      emitStreamEvent('attendance:punch', payload);
      return payload;
    },
  },
  {
    method: 'GET', pattern: '/attendance/me',
    handler: (_params, { query }) => {
      const actor = requireActor();
      const now = new Date();
      const from = query?.from ?? firstOfMonth(now);
      const to = query?.to ?? now.toISOString().slice(0, 10);
      const days = store.attendanceDays.filter((d) => d.employeeId === actor.id && inRange(d, from, to));
      return { employeeId: idStr(actor.id), from, to, days: days.map(toWireDay), weekly: weeklyRollup(days) };
    },
  },
  {
    // Not in docs/api-shapes.md — extrapolated to match GET /attendance/me's row shape.
    method: 'GET', pattern: '/attendance',
    handler: (_params, { query }) => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);
      let rows = store.attendanceDays.filter((d) => inRange(d, query?.from, query?.to));
      if (query?.employeeId) rows = rows.filter((d) => d.employeeId === Number(query.employeeId));
      return { data: rows.map(toWireDay) };
    },
  },
  {
    // Not in docs/api-shapes.md — extrapolated.
    method: 'GET', pattern: '/attendance/today',
    handler: () => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);
      return {
        data: store.todayPresence.map((p) => ({
          employee_id: idStr(p.employeeId), full_name: p.employeeName, department_id: null,
          status: p.status, first_in: p.firstIn, last_out: p.lastOut,
        })),
      };
    },
  },
  {
    // Not in docs/api-shapes.md — extrapolated.
    method: 'POST', pattern: '/attendance/recompute',
    handler: () => {
      const actor = requireActor();
      requireRole(actor, ['ADMIN']);
      return { recomputed: true, at: new Date().toISOString() };
    },
  },
];
