import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Any signed-in user may pass. Role-specific gating happens in RoleRoute, nested inside this.
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-text-muted">
        Loading…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }
  return <Outlet />;
}
