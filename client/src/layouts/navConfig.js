// Single source for both the desktop sidebar and the mobile bottom bar, so the two
// stay in sync automatically. `short` is the label used in the cramped bottom bar.

export const employeeNavItems = [
  { to: '/', label: 'Dashboard', short: 'Home' },
  { to: '/profile', label: 'Profile', short: 'Profile' },
  { to: '/attendance', label: 'Attendance', short: 'Attend.' },
  { to: '/leave/apply', label: 'Apply for leave', short: 'Apply' },
  { to: '/leave/history', label: 'Leave history', short: 'History' },
  { to: '/payslips', label: 'Payslips', short: 'Payslips' },
];

export const adminNavItems = [
  { to: '/admin', label: 'Dashboard', short: 'Home' },
  { to: '/admin/employees', label: 'Employees', short: 'People' },
  { to: '/admin/approvals', label: 'Approvals', short: 'Approve' },
  { to: '/admin/attendance', label: 'Attendance', short: 'Attend.' },
  { to: '/admin/payroll', label: 'Payroll', short: 'Payroll' },
];
