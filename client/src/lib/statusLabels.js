// user_status (ACTIVE/PENDING_VERIFICATION/DISABLED, CLAUDE.md §4) isn't one of the
// leave/attendance statuses Badge maps colours for (Step 2 scoped it to exactly those), so
// pages showing an employee's account status pass this as Badge's label override and accept
// the neutral colour rather than inventing a new Badge variant for a third status domain.
const LABELS = {
  ACTIVE: 'Active',
  PENDING_VERIFICATION: 'Pending verification',
  DISABLED: 'Disabled',
};

export function prettyStatus(status) {
  return LABELS[status] ?? status;
}
