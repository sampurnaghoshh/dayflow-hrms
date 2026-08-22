import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Table from '../../components/Table.jsx';
import Badge from '../../components/Badge.jsx';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import LeaveRequestDetail from './LeaveRequestDetail.jsx';

// GET /leave/requests (the list) does NOT include the approval timeline — confirmed against
// docs/api-shapes.md, and exactly the gap flagged when this page was first built. Opening a
// row now fetches GET /leave/requests/:id, which returns { request, timeline }.
export default function LeaveHistory() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [balances, setBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null); // { request, timeline } for selectedId
  const [detailLoading, setDetailLoading] = useState(false);
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
      .then((res) => setBalances(res?.balances ?? []))
      .catch(() => setBalances([]))
      .finally(() => setBalancesLoading(false));
  }, []);

  useEffect(() => {
    loadRequests();
    loadBalances();
    api.get('/leave/types').then((res) => setLeaveTypes(Array.isArray(res) ? res : [])).catch(() => setLeaveTypes([]));
  }, [loadRequests, loadBalances]);

  function typeName(code) {
    return leaveTypes.find((t) => t.code === code)?.name ?? code;
  }

  function loadDetail(id) {
    setDetailLoading(true);
    setDetail(null);
    api.get(`/leave/requests/${id}`)
      .then((res) => setDetail(res))
      .catch((err) => setCancelError(err.message || 'Could not load this request.'))
      .finally(() => setDetailLoading(false));
  }

  function toggleSelected(id) {
    setCancelError('');
    setSelectedId((prev) => {
      const next = prev === id ? null : id;
      if (next) loadDetail(next);
      else setDetail(null);
      return next;
    });
  }

  // Refetches the list, the balances, and the open detail so the reversal from a cancelled,
  // already-approved request is visible immediately, without needing to leave this page.
  async function handleCancel(id) {
    setCancelError('');
    setCancelling(true);
    try {
      await api.post(`/leave/requests/${id}/cancel`);
      await Promise.all([loadRequests(), loadBalances()]);
      loadDetail(id);
    } catch (err) {
      setCancelError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setCancelling(false);
    }
  }

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

      {selectedId && detailLoading && <Skeleton className="h-48 w-full" />}

      {selectedId && !detailLoading && detail && (
        <LeaveRequestDetail
          request={detail.request}
          timeline={detail.timeline}
          typeName={typeName}
          onCancel={() => handleCancel(selectedId)}
          cancelling={cancelling}
          cancelError={cancelError}
        />
      )}
    </div>
  );
}
