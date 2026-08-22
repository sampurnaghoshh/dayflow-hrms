import { useEffect, useRef } from 'react';
import Button from './Button.jsx';

// Dependency-free dialog: closes on Escape or backdrop click, moves focus into the dialog
// on open and restores it on close. Render <Modal open={...}> unconditionally — it's a
// no-op (returns null) while closed.
export default function Modal({ open, onClose, title, children, className = '' }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      // Tailwind's /opacity modifier can't build a color-mix for any var(--x)-backed theme
      // color here (verified — it silently emits no rule at all, not just for this token), so
      // the 40% scrim is spelled out as an arbitrary value instead. Still 100% token-derived.
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--surface-inverse)_40%,transparent)] px-4"
      onClick={() => onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
        className={`w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-md ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          {title ? <h2 id="modal-title" className="text-lg font-semibold text-text">{title}</h2> : <span />}
          <Button variant="ghost" aria-label="Close" onClick={() => onClose()}>✕</Button>
        </div>
        {children}
      </div>
    </div>
  );
}
