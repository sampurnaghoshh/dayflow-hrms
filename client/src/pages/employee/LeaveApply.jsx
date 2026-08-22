import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';

// Client-side estimate only (weekends excluded, holidays unknown to the client — there is no
// public holidays endpoint in §6). The server's count in §5.1 step 2 is authoritative; a
// mismatch surfaces as a 422 on submit, not silently here.
function estimateWorkingDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function LeaveApply() {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/leave/types'), api.get('/leave/balances')])
      .then(([typesRes, balancesRes]) => {
        if (cancelled) return;
        const types = typesRes?.data ?? [];
        setLeaveTypes(types);
        setBalances(balancesRes?.data ?? []);
        setLeaveTypeId((prev) => prev || types[0]?.id || '');
      })
      .catch(() => { if (!cancelled) setError('Could not load leave types. Refresh to try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedType = leaveTypes.find((t) => t.id === Number(leaveTypeId));
  const balanceRow = balances.find((b) => b.leaveTypeId === Number(leaveTypeId));
  const workingDays = useMemo(() => estimateWorkingDays(startDate, endDate), [startDate, endDate]);
  const remaining = balanceRow ? balanceRow.balance - workingDays : null;
  const insufficient = !!selectedType?.isPaid && !!balanceRow && workingDays > balanceRow.balance;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!leaveTypeId || !startDate || !endDate) {
      setError('Choose a leave type and date range.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post('/leave/requests', {
        leaveTypeId: Number(leaveTypeId), startDate, endDate, remarks: remarks || undefined,
      });
      setSubmitted(result);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="p-6">
        <Card className="mx-auto max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold text-text">Leave request submitted</h1>
          <p className="mb-6 text-sm text-text-muted">
            Your {submitted.dayCount}-day {submitted.leaveCode.toLowerCase()} leave request is pending approval.
          </p>
          <Button onClick={() => { setSubmitted(null); setStartDate(''); setEndDate(''); setRemarks(''); }}>
            Apply for another
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-semibold text-text">Apply for leave</h1>
      <Card className="max-w-lg">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <FormField id="leave-type" label="Leave type">
            <select
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              disabled={loading}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text disabled:opacity-60"
            >
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="leave-start" label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <FormField id="leave-end" label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <FormField id="leave-remarks" label="Remarks" hint="Optional context for your approver.">
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted"
            />
          </FormField>

          <div className={`rounded-md px-3 py-2 text-sm ${insufficient ? 'bg-danger-bg text-danger' : 'bg-surface-alt text-text-muted'}`}>
            {!startDate || !endDate ? (
              'Select a date range to see a preview.'
            ) : selectedType?.isPaid ? (
              `${workingDays} working day${workingDays === 1 ? '' : 's'}, ${remaining} remaining after this.`
            ) : (
              `${workingDays} working day${workingDays === 1 ? '' : 's'} (unpaid — no balance deducted).`
            )}
            {insufficient && (
              <p className="mt-1 font-medium">
                You only have {balanceRow.balance} days available. Reduce the range or choose a different leave type.
              </p>
            )}
          </div>

          <Button type="submit" loading={submitting} disabled={insufficient} className="mt-2">
            Submit request
          </Button>
        </form>
      </Card>
    </div>
  );
}
