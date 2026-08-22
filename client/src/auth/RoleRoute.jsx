import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Nested inside ProtectedRoute, so `user` is always set by the time this renders.
// Server-side role checks are the real guard (CLAUDE.md §8) — this only avoids a flash
// of the wrong layout before redirecting.
export default function RoleRoute({ roles }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
