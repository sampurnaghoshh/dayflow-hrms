import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import StatCard from '../../components/StatCard.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';

// Status colours are the same reserved tokens Badge already uses for these exact statuses —
// not a generated categorical palette, so no new colours and no cycling.
const STATUS_COLORS = {
  PENDING: 'var(--amber-600)', APPROVED: 'var(--pine-700)',
  REJECTED: 'var(--danger-500)', CANCELLED: 'var(--ink-muted)',
};
const STATUS_LABELS = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };
const TOOLTIP_STYLE = { background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', borderRadius: 8, fontSize: 12 };
const AXIS_TICK = { fill: 'var(--ink-muted)', fontSize: 12 };

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get('/dashboard/admin')
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    // Shaped like the loaded layout below (4 stat cards + 2 chart cards) so nothing new
    // pops into existence when the real content swaps in — only the skeletons resolve.
    return (
      <div className="flex flex-col gap-8 p-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </section>
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <EmptyState icon="📊" title="Couldn't load the dashboard" description="Refresh to try again." />
      </div>
    );
  }

  // Every key defaulted — an endpoint that's missing or renamed a field should render an
  // empty state, never crash the screen (and, since this shares a route tree with Approvals/
  // Employees/Attendance, never crash those either — see the ErrorBoundary in App.jsx as the
  // last line of defence if a guard here is ever missed).
  const counts = data.counts ?? {};
  const leaveByStatus = data.leaveByStatus ?? [];
  const attendanceByDepartment = data.attendanceByDepartment ?? [];
  const hasLeaveData = leaveByStatus.some((s) => s.count > 0);

  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-text">Dashboard</h1>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total employees" value={counts.totalEmployees ?? 0} />
        <StatCard label="Pending approvals" value={counts.pendingApprovals ?? 0} />
        <StatCard label="Present today" value={counts.presentToday ?? 0} />
        <StatCard label="On leave today" value={counts.onLeaveToday ?? 0} />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-text">Attendance rate by department</h2>
          {/* Fixed height on all three states (empty/chart, and the loading skeleton above)
              so this card never resizes when the data arrives. */}
          <div className="h-64">
            {attendanceByDepartment.length === 0 ? (
              <EmptyState
                icon="📈" title="No attendance data yet"
                description="Check back once today's attendance is recorded." className="h-full"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceByDepartment} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border-hairline)" />
                  <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: 'var(--border-hairline)' }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value}%`, 'Attendance']} />
                  <Bar dataKey="attendancePct" fill="var(--pine-500)" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="attendancePct" position="top" formatter={(v) => `${v}%`} fill="var(--ink-body)" fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-text">Leave requests by status</h2>
          <div className="h-64">
            {!hasLeaveData ? (
              <EmptyState
                icon="🌴" title="No leave requests yet"
                description="Requests will break down by status here once someone applies." className="h-full"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leaveByStatus} dataKey="count" nameKey="status"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}
                    label={({ count }) => (count > 0 ? count : '')}
                  >
                    {leaveByStatus.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} stroke="var(--surface-card)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend formatter={(value) => STATUS_LABELS[value] ?? value} wrapperStyle={{ fontSize: 12, color: 'var(--ink-muted)' }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [value, STATUS_LABELS[name] ?? name]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
