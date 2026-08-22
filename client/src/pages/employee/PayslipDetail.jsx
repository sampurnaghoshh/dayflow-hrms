import Card from '../../components/Card.jsx';

// Bare calendar day (period_month) — never run through new Date(isoString) directly, it can
// shift a day in timezones behind UTC (docs/api-shapes.md). Appending a local time avoids that.
function formatMonth(periodMonth) {
  return new Date(`${periodMonth}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function PayslipDetail({ payslip, error }) {
  if (error) {
    return (
      <Card className="mt-2">
        <p role="alert" className="text-sm text-danger">{error}</p>
      </Card>
    );
  }

  const earnings = payslip.lineItems.filter((li) => li.kind === 'EARNING');
  const deductions = payslip.lineItems.filter((li) => li.kind === 'DEDUCTION');

  return (
    <Card className="mt-2">
      <h3 className="mb-3 text-sm font-semibold text-text">{formatMonth(payslip.periodMonth)}</h3>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">Earnings</p>
          <ul className="flex flex-col gap-1">
            {earnings.map((li) => (
              <li key={li.code} className="flex justify-between text-sm text-text">
                <span>{li.label}</span><span>{li.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">Deductions</p>
          <ul className="flex flex-col gap-1">
            {deductions.map((li) => (
              <li key={li.code} className="flex justify-between text-sm text-text">
                <span>{li.label}</span><span>{li.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex justify-between border-t border-border pt-3 text-sm font-semibold text-text">
        <span>Net pay</span><span>{payslip.netPay.toFixed(2)}</span>
      </div>
    </Card>
  );
}
