import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';

export default function DecisionModal({ target, comment, onCommentChange, error, submitting, onCancel, onConfirm, typeName }) {
  const isApprove = target?.action === 'APPROVE';

  return (
    <Modal open={!!target} onClose={onCancel} title={target ? `${isApprove ? 'Approve' : 'Reject'} leave request` : ''}>
      {target && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            {target.step.fullName} · {typeName(target.step.leaveCode)} · {target.step.startDate} – {target.step.endDate} ·{' '}
            {target.step.dayCount} day{target.step.dayCount === 1 ? '' : 's'}
          </p>
          {target.step.remarks && <p className="text-sm text-text-muted">“{target.step.remarks}”</p>}

          {!isApprove && (
            <FormField
              id="decision-comment"
              label="Comment"
              required
              error={error}
              hint={error ? undefined : 'Explain why you are rejecting this request.'}
            >
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
              />
            </FormField>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button variant={isApprove ? 'primary' : 'danger'} loading={submitting} onClick={onConfirm}>
              {isApprove ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
