import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import Table from '../../components/Table.jsx';
import Badge from '../../components/Badge.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import { useAdminEmployee } from '../../context/AdminEmployeeContext.jsx';

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AttendanceBoard() {
  const { employeeId } = useAdminEmployee();
  const [today, setToday] = useState([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [roster, setRoster] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [weekLoading, setWeekLoading] = useState(true);

  const dates = useMemo(() => weekDates(mondayOf(new Date())), []);

  useEffect(() => {
    let cancelled = false;
    api.get('/attendance/today')
      .then((res) => { if (!cancelled) setToday(res?.data ?? []); })
      .catch(() => { if (!cancelled) setToday([]); })
      .finally(() => { if (!cancelled) setTodayLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setWeekLoading(true);
    Promise.all([
      api.get('/employees', { pageSize: 100 }),
      api.get('/attendance', { from: dates[0], to: dates[6], employeeId: employeeId || undefined }),
    ])
      .then(([employeesRes, attendanceRes]) => {
        if (cancelled) return;
        setRoster(employeesRes?.data ?? []);
        setAttendance(attendanceRes?.data ?? []);
      })
      .catch(() => { if (!cancelled) { setRoster([]); setAttendance([]); } })
      .finally(() => { if (!cancelled) setWeekLoading(false); });
    return () => { cancelled = true; };
  }, [dates, employeeId]);

  const visibleToday = employeeId ? today.filter((r) => r.employeeId === employeeId) : today;
  const visibleRoster = employeeId ? roster.filter((e) => e.id === employeeId) : roster;

  const attendanceByEmployee = useMemo(() => {
    const map = new Map();
    attendance.forEach((d) => {
      if (!map.has(d.employeeId)) map.set(d.employeeId, new Map());
      map.get(d.employeeId).set(d.workDate, d);
    });
    return map;
  }, [attendance]);

  const todayColumns = [
    { key: 'fullName', header: 'Employee' },
    { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'firstIn', header: 'First in', render: (row) => (row.firstIn ? new Date(row.firstIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—') },
    { key: 'lastOut', header: 'Last out', render: (row) => (row.lastOut ? new Date(row.lastOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—') },
  ];

  const weekColumns = [
    { key: 'fullName', header: 'Employee' },
    ...dates.map((date, i) => ({
      key: date,
      header: `${DAY_LABELS[i]} ${date.slice(5)}`,
      render: (row) => {
        const day = attendanceByEmployee.get(row.id)?.get(date);
        return day ? <Badge status={day.status} /> : <span className="text-text-muted">—</span>;
      },
    })),
  ];

  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-text">Attendance</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Today</h2>
        {todayLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table
            columns={todayColumns}
            rows={visibleToday}
            rowKey={(row) => row.employeeId}
            emptyTitle="Nobody has punched in yet"
            emptyDescription="Once employees check in today, they'll show up here."
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">This week</h2>
        {weekLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table
            columns={weekColumns}
            rows={visibleRoster}
            rowKey={(row) => row.id}
            emptyTitle="No employees to show"
            emptyDescription="Choose a different employee from the switcher above."
          />
        )}
      </section>
    </div>
  );
}
