import { cloneElement, isValidElement } from 'react';

// label + input + inline error + hint, wired together with the right aria attributes.
// Pass no children for a plain <input {...rest} />, or pass a single custom element
// (select, textarea, a DateRangePicker, …) and it gets the same id/aria wiring cloned onto it.
export default function FormField({ label, id, error, hint, required = false, className = '', children, ...inputProps }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const fieldProps = { id, 'aria-invalid': !!error, 'aria-describedby': describedBy };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>

      {children && isValidElement(children) ? (
        cloneElement(children, fieldProps)
      ) : (
        <input
          {...fieldProps}
          className={`rounded-md border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted ${
            error ? 'border-danger' : 'border-border'
          }`}
          {...inputProps}
        />
      )}

      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-text-muted">{hint}</p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
