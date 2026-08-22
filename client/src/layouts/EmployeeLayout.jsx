import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { employeeNavItems } from './navConfig.js';

const linkClasses = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-primary text-primary-text' : 'text-text hover:bg-surface-alt'}`;

export default function EmployeeLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-border md:bg-surface md:p-4">
        <div className="mb-6 text-lg font-semibold text-primary">Dayflow HRMS</div>
        <nav className="flex flex-col gap-1">
          {employeeNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClasses}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <div className="text-sm text-text-muted">Welcome back, {user?.fullName ?? user?.employeeCode}</div>
          <div className="flex items-center gap-3">
            {(user?.role === 'HR' || user?.role === 'ADMIN') && (
              <Link
                to="/admin"
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-alt"
              >
                Admin
              </Link>
            )}
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
        {employeeNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `text-xs font-medium ${isActive ? 'text-primary' : 'text-text-muted'}`}
          >
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
