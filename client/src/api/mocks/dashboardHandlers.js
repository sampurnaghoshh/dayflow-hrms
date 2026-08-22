import { requireActor, requireRole, store, idStr } from './state.js';

// GET /dashboard/admin is NOT in docs/api-shapes.md (checked fresh — no section for it at
// all), so the nested shapes below are inferred, not verified ground truth. The six
// top-level keys themselves (counts, leaveByStatus, headcountByDepartment,
// attendanceByDepartment, flaggedAbsences, recentRequests) are exactly what was reported
// from the real server; everything else here (kept camelCase, matching the pattern for
// hand-built/computed responses elsewhere) is a reasonable guess and should be re-checked
// once Sampurna captures this endpoint too.
export const dashboardHandlers = [
  {
    method: 'GET', pattern: '/dashboard/employee',
    handler: () => {
      const actor = requireActor();
      const recentActivity = store.notifications
        .filter((n) => n.userId === actor.userId)
        .slice(0, 8)
        .map((n) => ({ id: idStr(n.id), title: n.title, body: n.body, link: n.link, createdAt: n.createdAt, read: !!n.readAt }));
      const pendingLeaveRequests = store.leaveRequests.filter((r) => r.employeeId === actor.id && r.status === 'PENDING').length;
      const today = new Date().toISOString().slice(0, 10);
      const todayAttendance = store.attendanceDays.find((d) => d.employeeId === actor.id && d.workDate === today);
      return {
        recentActivity,
        quickStats: { pendingLeaveRequests, todayStatus: todayAttendance?.status ?? 'ABSENT' },
      };
    },
  },
  {
    method: 'GET', pattern: '/dashboard/admin',
    handler: () => {
      const actor = requireActor();
      requireRole(actor, ['HR', 'ADMIN']);

      const activeEmployees = store.employees.filter((e) => e.status === 'ACTIVE');
      const counts = {
        totalEmployees: activeEmployees.length,
        pendingApprovals: store.leaveRequests.filter((r) => r.status === 'PENDING').length,
        presentToday: store.todayPresence.filter((p) => p.status === 'PRESENT').length,
        onLeaveToday: store.todayPresence.filter((p) => p.status === 'ON_LEAVE').length,
      };

      const headcountByDept = new Map();
      activeEmployees.forEach((e) => {
        const entry = headcountByDept.get(e.departmentId) ?? { departmentId: e.departmentId, name: e.departmentName, count: 0 };
        entry.count += 1;
        headcountByDept.set(e.departmentId, entry);
      });
      const headcountByDepartment = [...headcountByDept.values()].map((e) => ({ ...e, departmentId: idStr(e.departmentId) }));

      const attendanceByDept = new Map();
      store.attendanceDays.forEach((d) => {
        if (['WEEKEND', 'HOLIDAY'].includes(d.status)) return;
        const employee = store.employees.find((e) => e.id === d.employeeId);
        if (!employee) return;
        const entry = attendanceByDept.get(employee.departmentName) ?? { name: employee.departmentName, present: 0, total: 0 };
        entry.total += 1;
        if (d.status === 'PRESENT') entry.present += 1;
        attendanceByDept.set(employee.departmentName, entry);
      });
      const attendanceByDepartment = [...attendanceByDept.values()].map((e) => ({
        name: e.name, attendancePct: e.total ? Math.round((1000 * e.present) / e.total) / 10 : 0,
      }));

      const leaveByStatus = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((status) => ({
        status, count: store.leaveRequests.filter((r) => r.status === status).length,
      }));

      const flaggedAbsences = store.employees
        .map((e) => {
          const absences = store.attendanceDays.filter((d) => d.employeeId === e.id && d.status === 'ABSENT');
          const edgeDay = absences.filter((d) => [1, 5].includes(new Date(`${d.workDate}T00:00:00`).getDay()));
          return { employeeId: idStr(e.id), fullName: e.fullName, edgeDayAbsences: edgeDay.length, totalAbsences: absences.length };
        })
        .filter((e) => e.totalAbsences >= 1)
        .sort((a, b) => b.edgeDayAbsences - a.edgeDayAbsences)
        .slice(0, 5);

      const recentRequests = [...store.leaveRequests]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5)
        .map((r) => {
          const employee = store.employees.find((e) => e.id === r.employeeId);
          return {
            id: idStr(r.id), employeeId: idStr(r.employeeId), fullName: employee?.fullName ?? null,
            leaveCode: r.leaveCode, startDate: r.startDate, endDate: r.endDate,
            dayCount: r.dayCount, status: r.status, createdAt: r.createdAt,
          };
        });

      return { counts, leaveByStatus, headcountByDepartment, attendanceByDepartment, flaggedAbsences, recentRequests };
    },
  },
];
