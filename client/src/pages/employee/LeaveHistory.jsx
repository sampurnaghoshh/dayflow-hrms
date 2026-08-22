import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Table from '../../components/Table.jsx';
import Badge from '../../components/Badge.jsx';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import LeaveRequestDetail from './LeaveRequestDetail.jsx';

// NOTE: the mock's GET /leave/requests returns full request objects, including `steps` —
// so the detail panel reads straight from the already-loaded row instead of a second fetch
// against GET /leave/requests/:id. If the real API keeps the list lighter, swap this for
// an on-demand detail fetch when a row is opened.
export default function LeaveHistory() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [balances, setBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const loadRequests = useCallback(() => {
    setRequestsLoading(true);
    return api.get('/leave/requests')
      .then((res) => setRequests(res?.data ?? []))
      .catch(() => setRequests([]))
      .finally(() => setRequestsLoading(false));
  }, []);

  const loadBalances = useCallback(() => {
    setBalancesLoading(true);
    return api.get('/leave/balances')
      .then((res) => setBalances(res?.data ?? []))
      .catch(() => setBalances([]))
      .finally(() => setBalancesLoading(false));
  }, []);

  useEffect(() => {
    loadRequests();
    loadBalances();
    api.get('/leave/types').then((res) => setLeaveTypes(res?.data ?? [])).catch(() => setLeaveTypes([]));
  }, [loadRequests, loadBalances]);

  function typeName(code) {
    return leaveTypes.find((t) => t.code === code)?.name ?? code;
  }

  function toggleSelected(id) {
    setCancelError('');
    setSelectedId((prev) => (prev === id ? null : id));
  }

  // Refetches the list and the balances so the reversal from a cancelled, already-approved
  // request is visible immediately, without needing to leave this page.
  async function handleCancel(id) {
    setCancelError('');
    setCancelling(true);
    try {
      await api.post(`/leave/requests/${id}/cancel`);
      await Promise.all([loadRequests(), loadBalances()]);
    } catch (err) {
      setCancelError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setCancelling(false);
    }
  }

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const columns = [
    { key: 'leaveCode', header: 'Type', render: (row) => typeName(row.leaveCode) },
    { key: 'dates', header: 'Dates', render: (row) => `${row.startDate} – ${row.endDate}` },
    { key: 'dayCount', header: 'Days' },
    { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
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
      <h1 className="text-2xl font-semibold text-text">Leave history</h1>

      <section className="flex flex-wrap gap-3">
        {balancesLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-36" />)
          : balances.map((b) => (
              <Card key={b.leaveTypeId} className="min-w-[140px]">
                <p className="text-xs text-text-muted">{b.leaveName}</p>
                <p className="text-lg font-semibold text-text">{b.balance} days</p>
              </Card>
            ))}
      </section>

      <Table
        columns={columns}
        rows={requests}
        loading={requestsLoading}
        emptyTitle="No leave requests yet"
        emptyDescription="Apply for leave to see it show up here."
        emptyAction={<Button variant="secondary" onClick={() => navigate('/leave/apply')}>Apply for leave</Button>}
      />

      {selected && (
        <LeaveRequestDetail
          request={selected}
          typeName={typeName}
          onCancel={() => handleCancel(selected.id)}
          cancelling={cancelling}
          cancelError={cancelError}
        />
      )}
    </div>
  );
}
