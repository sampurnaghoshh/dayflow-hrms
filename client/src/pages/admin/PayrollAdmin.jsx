import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Table from '../../components/Table.jsx';
import Badge from '../../components/Badge.jsx';
import Button from '../../components/Button.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAdminEmployee } from '../../context/AdminEmployeeContext.jsx';
import SalaryStructureForm from './SalaryStructureForm.jsx';

// Bare calendar day — appending a local time avoids the UTC-shift pitfall (docs/api-shapes.md).
function formatDate(isoDay) {
  return new Date(`${isoDay}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function PayrollAdmin() {
  const { employeeId } = useAdminEmployee();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    if (!employeeId) return;
    setLoading(true);
    api.get(`/payroll/employees/${employeeId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  if (!employeeId) {
    return (
      <div className="p-6">
        <EmptyState
          icon="👤"
          title="Choose an employee"
          description="Select someone from the switcher above to manage their salary structure."
        />
      </div>
    );
  }

  // Effective-from/to make it visually obvious that closing a version never overwrites it —
  // a new row appears, the old one's "Effective to" fills in, nothing is edited in place.
  const columns = [
    { key: 'effectiveFrom', header: 'Effective from', render: (row) => formatDate(row.effectiveFrom) },
    { key: 'effectiveTo', header: 'Effective to', render: (row) => (row.effectiveTo ? formatDate(row.effectiveTo) : '—') },
    {
      key: 'status', header: 'Status',
      render: (row) => (row.effectiveTo ? <Badge status="CANCELLED">Closed</Badge> : <Badge status="APPROVED">Current</Badge>),
    },
    { key: 'ctcAnnual', header: 'Annual CTC', render: (row) => row.ctcAnnual.toLocaleString() },
    { key: 'createdByName', header: 'Set by' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Payroll</h1>
        {!showForm && <Button onClick={() => setShowForm(true)}>New structure</Button>}
      </div>

      {showForm && (
        <SalaryStructureForm
          employeeId={employeeId}
          onCancel={() => setShowForm(false)}
          onSaved={(result) => {
            setData(result);
            setShowForm(false);
            showToast('Salary structure updated.', 'success');
          }}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Version history</h2>
        <Table
          columns={columns}
          rows={data?.history ?? []}
          loading={loading}
          rowKey={(row) => row.id}
          emptyTitle="No salary structure yet"
          emptyDescription="Add one with New structure above."
        />
      </section>
    </div>
  );
}
