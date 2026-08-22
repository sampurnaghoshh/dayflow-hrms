// A pulsing placeholder block. Size it with className (e.g. "h-4 w-full").
export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-surface-alt ${className}`} aria-hidden="true" />;
}
