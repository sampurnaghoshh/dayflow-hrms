import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Table from '../../components/Table.jsx';
import FormField from '../../components/FormField.jsx';
import Button from '../../components/Button.jsx';
import Badge from '../../components/Badge.jsx';
import { prettyStatus } from '../../lib/statusLabels.js';

const PAGE_SIZE = 10;

export default function Employees() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/employees', { q: search || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setRows(res?.data ?? []);
        setTotal(res?.total ?? 0);
      })
      .catch(() => { if (!cancelled) { setRows([]); setTotal(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, page]);

  function handleSearchChange(value) {
    setSearch(value);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = [
    {
      key: 'fullName', header: 'Name',
      render: (row) => (
        <Link to={`/admin/employees/${row.id}`} className="font-medium text-primary hover:text-primary-hover">
          {row.fullName}
        </Link>
      ),
    },
    { key: 'employeeCode', header: 'Code' },
    { key: 'department', header: 'Department', render: (row) => row.department?.name ?? '—' },
    { key: 'role', header: 'Role' },
    { key: 'status', header: 'Status', render: (row) => <Badge status={row.status}>{prettyStatus(row.status)}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text">Employees</h1>

      <FormField
        id="employee-search" label="Search" placeholder="Name, employee code or email"
        value={search} onChange={(e) => handleSearchChange(e.target.value)} className="max-w-sm"
      />

      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        emptyTitle={search ? 'No matches' : 'No employees yet'}
        emptyDescription={search ? 'Try a different search.' : 'Employees will show up here once they sign up.'}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{total} employee{total === 1 ? '' : 's'}</p>
        <div className="flex items-center gap-3">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-text-muted">Page {page} of {totalPages}</span>
          <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
