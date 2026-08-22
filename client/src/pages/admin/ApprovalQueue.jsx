import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Table from '../../components/Table.jsx';
import FormField from '../../components/FormField.jsx';
import Button from '../../components/Button.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useStream } from '../../context/StreamContext.jsx';
import { useStreamEvent } from '../../context/useStreamEvent.js';
import DecisionModal from './DecisionModal.jsx';

export default function ApprovalQueue() {
  const { showToast } = useToast();
  const { resetApprovalBellCount } = useStream();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const [target, setTarget] = useState(null); // { step, action: 'APPROVE' | 'REJECT' }
  const [comment, setComment] = useState('');
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // GET /leave/types returns a bare array, not { data: [...] } (docs/api-shapes.md).
    api.get('/leave/types').then((res) => setLeaveTypes(Array.isArray(res) ? res : [])).catch(() => setLeaveTypes([]));
  }, []);

  // Visiting the queue is treated as having seen the new requests it bumped the bell for.
  useEffect(() => { resetApprovalBellCount(); }, [resetApprovalBellCount]);

  const loadQueue = useCallback(() => {
    setLoading(true);
    return api.get('/approvals/queue', { leaveCode: typeFilter || undefined })
      .then((res) => setQueue(res?.data ?? []))
      .catch(() => setQueue([]))
      .finally(() => setLoading(false));
  }, [typeFilter]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // approval:new — someone just applied for leave the caller can decide on.
  // approval:decided — someone else (another tab, another approver) decided a step first;
  // the row needs to disappear even if it wasn't this tab's optimistic update that did it.
  useStreamEvent('approval:new', loadQueue);
  useStreamEvent('approval:decided', loadQueue);

  function typeName(code) {
    return leaveTypes.find((t) => t.code === code)?.name ?? code;
  }

  function openModal(step, action) {
    setTarget({ step, action });
    setComment('');
    setModalError('');
  }

  // Optimistic: the row disappears immediately. On a 409 (someone else decided it first) or
  // any other failure, it's put back and a toast explains what happened.
  async function handleConfirm() {
    const { step, action } = target;
    if (action === 'REJECT' && !comment.trim()) {
      setModalError('Add a comment explaining the rejection.');
      return;
    }
    setSubmitting(true);
    const snapshot = queue;
    setQueue((prev) => prev.filter((r) => r.stepId !== step.stepId));
    setTarget(null);
    try {
      await api.post(`/approvals/steps/${step.stepId}/decide`, { action, comment: comment || undefined });
      showToast(action === 'APPROVE' ? 'Approved.' : 'Rejected.', 'success');
    } catch (err) {
      setQueue(snapshot);
      // Real code is STEP_ALREADY_DECIDED (docs/api-shapes.md) — this mock had invented
      // REQUEST_ALREADY_DECIDED before that was captured. The toast text stays a fixed UX
      // string regardless of the server's own (more detailed) message for this case.
      showToast(
        err.code === 'STEP_ALREADY_DECIDED'
          ? 'Someone else already decided this request.'
          : (err.message || 'Something went wrong. Please try again.'),
        'danger',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const visibleRows = queue.filter((r) => r.fullName.toLowerCase().includes(search.trim().toLowerCase()));

  const columns = [
    { key: 'fullName', header: 'Employee' },
    { key: 'leaveCode', header: 'Leave type', render: (row) => typeName(row.leaveCode) },
    { key: 'dates', header: 'Dates', render: (row) => `${row.startDate} – ${row.endDate}` },
    { key: 'dayCount', header: 'Days' },
    { key: 'remarks', header: 'Remarks', render: (row) => row.remarks || '—' },
    {
      key: 'actions', header: '',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button onClick={() => openModal(row, 'APPROVE')}>Approve</Button>
          <Button variant="danger" onClick={() => openModal(row, 'REJECT')}>Reject</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text">Approval queue</h1>

      <div className="flex flex-wrap items-end gap-3">
        <FormField
          id="queue-search" label="Search employee" placeholder="Employee name"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <FormField id="queue-type" label="Leave type">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
          >
            <option value="">All types</option>
            {leaveTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </FormField>
      </div>

      <Table
        columns={columns}
        rows={visibleRows}
        loading={loading}
        rowKey={(row) => row.stepId}
        emptyTitle={queue.length === 0 ? 'Queue is clear' : 'No matches'}
        emptyDescription={
          queue.length === 0
            ? 'No leave requests are waiting on your decision right now.'
            : 'Try a different search or clear the filters.'
        }
      />

      <DecisionModal
        target={target}
        comment={comment}
        onCommentChange={setComment}
        error={modalError}
        submitting={submitting}
        onCancel={() => setTarget(null)}
        onConfirm={handleConfirm}
        typeName={typeName}
      />
    </div>
  );
}
