import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { useAdminEmployee } from '../context/AdminEmployeeContext.jsx';
import { adminNavItems } from './navConfig.js';

const linkClasses = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-primary text-primary-text' : 'text-text hover:bg-surface-alt'}`;

// SRS 3.2.2 — lets HR/ADMIN pick an employee to view admin screens "as". Writes to
// AdminEmployeeContext; screens that support the switch (attendance board, payroll) read it.
function EmployeeSwitcher() {
  const { employeeId, setEmployeeId } = useAdminEmployee();
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/employees', { pageSize: 100 })
      .then((res) => { if (!cancelled) setEmployees(res?.data ?? []); })
      .catch(() => { if (!cancelled) setEmployees([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <label className="flex items-center gap-2 text-sm text-text-muted">
      Viewing as
      <select
        value={employeeId ?? ''}
        onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text"
      >
        <option value="">All employees</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.fullName}</option>
        ))}
      </select>
    </label>
  );
}

export default function AdminLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-border md:bg-surface md:p-4">
        <div className="mb-6 text-lg font-semibold text-primary">Dayflow HRMS</div>
        <nav className="flex flex-col gap-1">
          {adminNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/admin'} className={linkClasses}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="text-sm text-text-muted">{user?.fullName} · {user?.role}</div>
          <div className="flex flex-wrap items-center gap-3">
            <EmployeeSwitcher />
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-alt"
            >
              My workspace
            </Link>
            <button type="button" aria-label="Notifications" className="rounded-full p-2 text-text hover:bg-surface-alt">
              🔔
            </button>
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-alt"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-border bg-surface py-2 md:hidden">
        {adminNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
            className={({ isActive }) => `text-xs font-medium ${isActive ? 'text-primary' : 'text-text-muted'}`}
          >
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
