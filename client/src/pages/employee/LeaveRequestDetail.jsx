import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Button from '../../components/Button.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const CANCELLABLE = ['PENDING', 'APPROVED'];

export default function LeaveRequestDetail({ request, typeName, onCancel, cancelling, cancelError }) {
  return (
    <Card className="mt-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-text">{typeName(request.leaveCode)}</h2>
          <p className="text-sm text-text-muted">
            {request.startDate} – {request.endDate} · {request.dayCount} day{request.dayCount === 1 ? '' : 's'}
          </p>
        </div>
        <Badge status={request.status} />
      </div>

      {request.remarks && <p className="mt-3 text-sm text-text-muted">“{request.remarks}”</p>}

      <h3 className="mb-2 mt-4 text-sm font-semibold text-text">Approval timeline</h3>
      <ol className="flex flex-col gap-2">
        {request.steps.map((step) => (
          <li key={step.id} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text">Step {step.stepNo} · {step.approverRole}</span>
              <Badge status={step.status} />
            </div>
            {step.approverName && <p className="mt-1 text-xs text-text-muted">Decided by {step.approverName}</p>}
            {step.comment && <p className="text-xs text-text-muted">“{step.comment}”</p>}
            {step.actedAt && <p className="text-xs text-text-muted">{formatDate(step.actedAt)}</p>}
          </li>
        ))}
      </ol>

      {cancelError && (
        <p role="alert" className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{cancelError}</p>
      )}

      {CANCELLABLE.includes(request.status) && (
        <Button variant="danger" className="mt-4" loading={cancelling} onClick={onCancel}>
          Cancel request
        </Button>
      )}
    </Card>
  );
}
