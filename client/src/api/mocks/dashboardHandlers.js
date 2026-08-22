import { requireActor, requireRole, store } from './state.js';

export const dashboardHandlers = [
  {
    method: 'GET', pattern: '/dashboard/employee',
    handler: () => {
      const actor = requireActor();
      const balances = store.leaveBalances.filter((b) => b.employeeId === actor.id);
      const recentActivity = store.notifications
        .filter((n) => n.userId === actor.userId)
        .slice(0, 8)
        .map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt, read: !!n.readAt }));
      const pendingLeaveRequests = store.leaveRequests.filter((r) => r.employeeId === actor.id && r.status === 'PENDING').length;
      const today = new Date().toISOString().slice(0, 10);
      const todayAttendance = store.attendanceDays.find((d) => d.employeeId === actor.id && d.workDate === today);
      return {
        leaveBalances: balances,
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
      const totalEmployees = store.employees.filter((e) => e.status === 'ACTIVE').length;
      const pendingApprovals = store.leaveRequests.filter((r) => r.status === 'PENDING').length;
      const presentToday = store.todayPresence.filter((p) => p.status === 'PRESENT').length;
      const onLeaveToday = store.todayPresence.filter((p) => p.status === 'ON_LEAVE').length;

      const byDept = new Map();
      store.attendanceDays.forEach((d) => {
        if (['WEEKEND', 'HOLIDAY'].includes(d.status)) return;
        const employee = store.employees.find((e) => e.id === d.employeeId);
        if (!employee) return;
        const entry = byDept.get(employee.departmentName) ?? { name: employee.departmentName, present: 0, total: 0 };
        entry.total += 1;
        if (d.status === 'PRESENT') entry.present += 1;
        byDept.set(employee.departmentName, entry);
      });
      const attendanceByDepartment = [...byDept.values()].map((e) => ({
        name: e.name, attendancePct: e.total ? Math.round((1000 * e.present) / e.total) / 10 : 0,
      }));

      const leaveStatusBreakdown = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((status) => ({
        status, count: store.leaveRequests.filter((r) => r.status === status).length,
      }));

      const flaggedEmployees = store.employees
        .map((e) => {
          const absences = store.attendanceDays.filter((d) => d.employeeId === e.id && d.status === 'ABSENT');
          const edgeDay = absences.filter((d) => [1, 5].includes(new Date(`${d.workDate}T00:00:00`).getDay()));
          return { employeeId: e.id, fullName: e.fullName, edgeDayAbsences: edgeDay.length, totalAbsences: absences.length };
        })
        .filter((e) => e.totalAbsences >= 1)
        .sort((a, b) => b.edgeDayAbsences - a.edgeDayAbsences)
        .slice(0, 5);

      return {
        stats: { totalEmployees, pendingApprovals, presentToday, onLeaveToday },
        attendanceByDepartment,
        leaveStatusBreakdown,
        flaggedEmployees,
      };
    },
  },
];
