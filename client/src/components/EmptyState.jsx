// Every list in the app should render this instead of a bare "No data" (CLAUDE.md Step 6):
// a title that says what's missing, an optional description, and a suggested next action.
export default function EmptyState({ icon = '📭', title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 py-12 text-center ${className}`}>
      <span className="text-2xl" aria-hidden="true">{icon}</span>
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
