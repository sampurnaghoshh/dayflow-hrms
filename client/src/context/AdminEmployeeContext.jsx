import { createContext, useContext, useMemo, useState } from 'react';

// SRS 3.2.2 — lets an HR/ADMIN user pick an employee to view admin screens "as". Screens
// that support it (attendance board, payroll) read `employeeId` from here; screens that
// don't (the employees list itself) simply ignore it.
const AdminEmployeeContext = createContext(null);

export function AdminEmployeeProvider({ children }) {
  const [employeeId, setEmployeeId] = useState(null);
  const value = useMemo(() => ({ employeeId, setEmployeeId }), [employeeId]);
  return <AdminEmployeeContext.Provider value={value}>{children}</AdminEmployeeContext.Provider>;
}

export function useAdminEmployee() {
  const ctx = useContext(AdminEmployeeContext);
  if (!ctx) throw new Error('useAdminEmployee must be used within AdminEmployeeProvider');
  return ctx;
}
