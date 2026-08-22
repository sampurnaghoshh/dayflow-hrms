import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Table from '../../components/Table.jsx';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import PayslipDetail from './PayslipDetail.jsx';

function formatMonth(periodMonth) {
  return new Date(`${periodMonth}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function Payslips() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get('/payroll/me')
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData({ current: null, history: [], payslips: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function loadDetail(id) {
    setDetailLoading(true);
    setDetail(null);
    api.get(`/payroll/payslips/${id}`)
      .then((res) => setDetail(res))
      .catch((err) => setDetailError(err.message || 'Could not load this payslip.'))
      .finally(() => setDetailLoading(false));
  }

  function toggleSelected(id) {
    setDetailError('');
    setSelectedId((prev) => {
      const next = prev === id ? null : id;
      if (next) loadDetail(next);
      else setDetail(null);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const columns = [
    { key: 'periodMonth', header: 'Period', render: (row) => formatMonth(row.periodMonth) },
    { key: 'grossEarnings', header: 'Gross', render: (row) => row.grossEarnings.toFixed(2) },
    { key: 'totalDeductions', header: 'Deductions', render: (row) => row.totalDeductions.toFixed(2) },
    { key: 'netPay', header: 'Net pay', render: (row) => row.netPay.toFixed(2) },
    {
      key: 'actions', header: '',
      render: (row) => (
        <Button variant="ghost" onClick={() => toggleSelected(row.id)}>
          {selectedId === row.id ? 'Hide' : 'View'}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text">Payslips</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Salary structure</h2>
        {data.current ? (
          <Card>
            <p className="text-xs text-text-muted">Current annual CTC</p>
            <p className="text-2xl font-semibold text-text">{data.current.ctcAnnual.toLocaleString()}</p>
            <p className="mt-1 text-xs text-text-muted">Effective from {data.current.effectiveFrom}</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-text-muted">Earnings</p>
                {data.current.components.filter((c) => c.kind === 'EARNING').map((c) => (
                  <div key={c.code} className="flex justify-between text-sm text-text">
                    <span>{c.label}</span><span>{c.monthlyAmount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-text-muted">Deductions</p>
                {data.current.components.filter((c) => c.kind === 'DEDUCTION').map((c) => (
                  <div key={c.code} className="flex justify-between text-sm text-text">
                    <span>{c.label}</span><span>{c.monthlyAmount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState icon="💵" title="No salary structure yet" description="Ask HR to set one up for you." />
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Payslip history</h2>
        <Table
          columns={columns}
          rows={data.payslips}
          rowKey={(row) => row.id}
          emptyTitle="No payslips yet"
          emptyDescription="Payslips show up here after a payroll run."
        />
      </section>

      {selectedId && detailLoading && <Skeleton className="h-48 w-full" />}
      {selectedId && !detailLoading && detail && <PayslipDetail payslip={detail} error={detailError} />}
    </div>
  );
}
