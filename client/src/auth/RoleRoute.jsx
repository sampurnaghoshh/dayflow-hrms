import { Link, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Nested inside ProtectedRoute, so `user` is normally already set by the time this renders —
// but never assume that; treat "no user" as reachable too rather than crashing on user.role.
//
// Critical: this component guards more than one route tree (EMPLOYEE/HR/ADMIN wraps "/",
// HR/ADMIN wraps "/admin/*"), and "/" sits *inside* the first of those. Navigating to a path
// that's itself behind this same guard — as a role-mismatch fallback used to do — re-enters
// this exact check and, for a role that never matches, loops forever with the URL frozen and
// nothing rendered (see the bug this replaced). So a role mismatch never navigates anywhere;
// it renders in place. Only "no user at all" redirects, and only to /sign-in, which no
// RoleRoute ever guards.
export default function RoleRoute({ roles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-bg px-4 text-center">
        <h1 className="text-xl font-semibold text-text">You don't have access to this page</h1>
        <p className="text-sm text-text-muted">Your account doesn't have permission to view this.</p>
        <Link to="/" className="mt-2 text-sm font-medium text-primary hover:text-primary-hover">
          Go home
        </Link>
      </div>
    );
  }

  return <Outlet />;
}
