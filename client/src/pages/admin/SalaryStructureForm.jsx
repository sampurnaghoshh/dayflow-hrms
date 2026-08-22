import { useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';

// A fixed component set (matching the codes already seeded — CLAUDE.md §4 payroll tables)
// rather than a free-form builder, to keep the form simple. CTC is derived from the earning
// rows, never typed separately, so it can't drift from the components that back it.
const DEFAULT_COMPONENTS = [
  { code: 'BASIC', label: 'Basic salary', kind: 'EARNING' },
  { code: 'HRA', label: 'House rent allowance', kind: 'EARNING' },
  { code: 'SPECIAL', label: 'Special allowance', kind: 'EARNING' },
  { code: 'PF', label: 'Provident fund', kind: 'DEDUCTION' },
  { code: 'PT', label: 'Professional tax', kind: 'DEDUCTION' },
];

export default function SalaryStructureForm({ employeeId, onSaved, onCancel }) {
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const components = DEFAULT_COMPONENTS.map((c) => ({ ...c, monthlyAmount: Number(amounts[c.code] || 0) }));
  const ctcAnnual = useMemo(
    () => components.filter((c) => c.kind === 'EARNING').reduce((sum, c) => sum + c.monthlyAmount, 0) * 12,
    [components],
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!effectiveFrom) {
      setError('Choose an effective date.');
      return;
    }
    if (ctcAnnual <= 0) {
      setError('Enter at least one earning amount.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post(`/payroll/employees/${employeeId}/structure`, { effectiveFrom, ctcAnnual, components });
      onSaved(result);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-text">New salary structure</h3>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {error && <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <FormField
          id="structure-effective-from" label="Effective from" type="date"
          value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DEFAULT_COMPONENTS.map((c) => (
            <FormField
              key={c.code} id={`structure-${c.code}`} label={`${c.label} (monthly)`}
              type="number" min="0" step="0.01"
              value={amounts[c.code] ?? ''}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [c.code]: e.target.value }))}
            />
          ))}
        </div>

        <p className="text-sm text-text-muted">
          Annual CTC: <span className="font-semibold text-text">{ctcAnnual.toLocaleString()}</span>
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={submitting}>Save structure</Button>
        </div>
      </form>
    </Card>
  );
}
