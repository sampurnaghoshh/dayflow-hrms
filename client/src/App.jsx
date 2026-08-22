import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import RoleRoute from './auth/RoleRoute.jsx';
import { AdminEmployeeProvider } from './context/AdminEmployeeContext.jsx';
import EmployeeLayout from './layouts/EmployeeLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import ComponentKit from './pages/dev/ComponentKit.jsx';
import SignIn from './pages/auth/SignIn.jsx';
import SignUp from './pages/auth/SignUp.jsx';
import VerifyEmail from './pages/auth/VerifyEmail.jsx';
import EmployeeDashboard from './pages/employee/Dashboard.jsx';
import LeaveApply from './pages/employee/LeaveApply.jsx';

// Stand-in for every page not built yet — Steps 3 and 4 replace these one route at a time.
function Placeholder({ title }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-text">{title}</h1>
      <p className="mt-2 text-sm text-text-muted">This screen is coming in a later step.</p>
    </div>
  );
}

function AdminLayoutWithContext() {
  return (
    <AdminEmployeeProvider>
      <AdminLayout />
    </AdminEmployeeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* TEMPORARY — remove once every component in the kit has been used for real. */}
          <Route path="/kit" element={<ComponentKit />} />

          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<RoleRoute roles={['EMPLOYEE', 'HR', 'ADMIN']} />}>
              <Route element={<EmployeeLayout />}>
                <Route path="/" element={<EmployeeDashboard />} />
                <Route path="/profile" element={<Placeholder title="Profile" />} />
                <Route path="/attendance" element={<Placeholder title="Attendance" />} />
                <Route path="/leave/apply" element={<LeaveApply />} />
                <Route path="/leave/history" element={<Placeholder title="Leave history" />} />
                <Route path="/payslips" element={<Placeholder title="Payslips" />} />
              </Route>
            </Route>

            <Route element={<RoleRoute roles={['HR', 'ADMIN']} />}>
              <Route element={<AdminLayoutWithContext />}>
                <Route path="/admin" element={<Placeholder title="Admin dashboard" />} />
                <Route path="/admin/employees" element={<Placeholder title="Employees" />} />
                <Route path="/admin/employees/:id" element={<Placeholder title="Employee detail" />} />
                <Route path="/admin/approvals" element={<Placeholder title="Approval queue" />} />
                <Route path="/admin/attendance" element={<Placeholder title="Attendance board" />} />
                <Route path="/admin/payroll" element={<Placeholder title="Payroll" />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
