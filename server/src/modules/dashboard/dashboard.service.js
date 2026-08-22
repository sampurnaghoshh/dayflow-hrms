/**
 * Dashboard business logic. No req, no res, no SQL.
 *
 * Both dashboards are pure reads, so neither opens a transaction: every query runs on
 * the pool and gets its own connection, which is also what lets them run concurrently.
 */
import { pool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { notFound } from '../../lib/errors.js';
import * as q from './dashboard.queries.js';
import * as leaveQ from '../leave/leave.queries.js';
import * as notificationsService from '../notifications/notifications.service.js';

const TZ = env.APP_TIMEZONE;

/**
 * GET /dashboard/employee - SRS 3.2.1: cards plus recent activity.
 *
 * Balances come from v_leave_balances like everywhere else (§1.1) and stay strings;
 * the counts and minutes around them are display aggregates and are numbers.
 */
export async function getEmployeeDashboard(actor, { activityLimit }) {
  if (!actor.employeeId) {
    throw notFound('EMPLOYEE_NOT_FOUND', 'This account has no employee record.');
  }

  const [balances, leaveCounts, attendanceMonth, today, recentActivity, upcomingHolidays] =
    await Promise.all([
      leaveQ.getBalances(pool, { employeeId: actor.employeeId }),
      q.getEmployeeLeaveCounts(pool, { employeeId: actor.employeeId }),
      q.getMonthAttendanceSummary(pool, { employeeId: actor.employeeId, timezone: TZ }),
      q.getTodayForEmployee(pool, { employeeId: actor.employeeId, timezone: TZ }),
      notificationsService.getRecent(actor.id, activityLimit),
      q.getUpcomingHolidays(pool, { limit: 3 }),
    ]);

  return {
    employeeId: String(actor.employeeId),
    balances,
    leave: leaveCounts,
    attendance: attendanceMonth,
    today,
    recentActivity,
    upcomingHolidays,
  };
}

/**
 * GET /dashboard/admin - SRS 3.2.2: KPIs and counts.
 *
 * attendanceByDepartment and flaggedAbsences are the two charts §2 allows recharts for.
 * Everything else is a count or a list.
 */
export async function getAdminDashboard(actor, { recentLimit }) {
  const [
    counts,
    leaveByStatus,
    headcountByDepartment,
    attendanceByDepartment,
    flaggedAbsences,
    recentRequests,
  ] = await Promise.all([
    q.getAdminCounts(pool, { timezone: TZ }),
    q.getLeaveRequestsByStatus(pool),
    q.getHeadcountByDepartment(pool),
    q.getAttendanceRateByDepartment(pool),
    q.getFlaggedAbsencePatterns(pool),
    q.getRecentLeaveRequests(pool, { limit: recentLimit }),
  ]);

  return {
    counts,
    leaveByStatus,
    headcountByDepartment,
    // Chart 1 (§7): attendance rate per department, last 30 days.
    attendanceByDepartment,
    // Chart 2 (§7): the Monday/Friday absence pattern.
    flaggedAbsences,
    recentRequests,
  };
}
