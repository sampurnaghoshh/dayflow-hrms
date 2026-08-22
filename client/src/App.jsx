import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
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
import LeaveHistory from './pages/employee/LeaveHistory.jsx';
import ApprovalQueue from './pages/admin/ApprovalQueue.jsx';
import Employees from './pages/admin/Employees.jsx';
import EmployeeDetail from './pages/admin/EmployeeDetail.jsx';
import AttendanceBoard from './pages/admin/AttendanceBoard.jsx';

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
      <ToastProvider>
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
                  <Route path="/leave/history" element={<LeaveHistory />} />
                  <Route path="/payslips" element={<Placeholder title="Payslips" />} />
                </Route>
              </Route>

              <Route element={<RoleRoute roles={['HR', 'ADMIN']} />}>
                <Route element={<AdminLayoutWithContext />}>
                  <Route path="/admin" element={<Placeholder title="Admin dashboard" />} />
                  <Route path="/admin/employees" element={<Employees />} />
                  <Route path="/admin/employees/:id" element={<EmployeeDetail />} />
                  <Route path="/admin/approvals" element={<ApprovalQueue />} />
                  <Route path="/admin/attendance" element={<AttendanceBoard />} />
                  <Route path="/admin/payroll" element={<Placeholder title="Payroll" />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
