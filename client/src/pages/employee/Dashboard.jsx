import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Table from '../../components/Table.jsx';
import RecentActivity from './RecentActivity.jsx';

const QUICK_LINKS = [
  { to: '/profile', icon: '🧑', title: 'Profile', description: 'View and edit your details' },
  { to: '/attendance', icon: '🕒', title: 'Attendance', description: 'Check in, check out, view history' },
  { to: '/leave/apply', icon: '🌴', title: 'Leave', description: 'Apply for leave or check balances' },
  { to: '/payslips', icon: '💵', title: 'Payslips', description: 'View your pay history' },
];

const BALANCE_COLUMNS = [
  { key: 'leaveName', header: 'Leave type' },
  { key: 'balance', header: 'Balance', render: (row) => `${row.balance} days` },
];

export default function Dashboard() {
  const [balances, setBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // SRS 3.2.1: balances from /leave/balances, recent activity from /dashboard/employee.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/leave/balances')
      // { employeeId, balances: [...] }, not { data: [...] } (docs/api-shapes.md).
      .then((res) => { if (!cancelled) setBalances(res?.balances ?? []); })
      .catch(() => { if (!cancelled) setBalances([]); })
      .finally(() => { if (!cancelled) setBalancesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/dashboard/employee')
      .then((res) => { if (!cancelled) setActivity(res?.recentActivity ?? []); })
      .catch(() => { if (!cancelled) setActivity([]); })
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-text">Dashboard</h1>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {QUICK_LINKS.map((item) => (
          <Link key={item.to} to={item.to} className="block rounded-lg">
            <Card className="flex flex-col gap-1 transition-colors hover:border-primary">
              <span className="text-2xl" aria-hidden="true">{item.icon}</span>
              <span className="text-sm font-semibold text-text">{item.title}</span>
              <span className="text-xs text-text-muted">{item.description}</span>
            </Card>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Leave balance</h2>
        <Table
          columns={BALANCE_COLUMNS}
          rows={balances}
          loading={balancesLoading}
          rowKey={(row) => row.leaveTypeId}
          emptyTitle="No leave balances yet"
          emptyDescription="Your balances appear once leave accrual starts."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Recent activity</h2>
        <RecentActivity items={activity} loading={activityLoading} />
      </section>
    </div>
  );
}
