// Maps leave_status (PENDING/APPROVED/REJECTED/CANCELLED) and day_status (the 6 attendance
// statuses) to token colours — see CLAUDE.md §4. Anything unrecognised falls back to neutral.
const STATUS_STYLES = {
  PENDING: 'bg-warning-bg text-warning',
  APPROVED: 'bg-success-bg text-success',
  REJECTED: 'bg-danger-bg text-danger',
  CANCELLED: 'bg-surface-alt text-text-muted',

  PRESENT: 'bg-success-bg text-success',
  ABSENT: 'bg-danger-bg text-danger',
  HALF_DAY: 'bg-warning-bg text-warning',
  ON_LEAVE: 'bg-info-bg text-info',
  HOLIDAY: 'bg-surface-alt text-text-muted',
  WEEKEND: 'bg-surface-alt text-text-muted',
};

const STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half day',
  ON_LEAVE: 'On leave',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Weekend',
};

export default function Badge({ status, children, className = '' }) {
  const style = STATUS_STYLES[status] ?? 'bg-surface-alt text-text-muted';
  const label = children ?? STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style} ${className}`}>
      {label}
    </span>
  );
}
