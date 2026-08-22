import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

const VARIANT_STYLES = {
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
};

let nextId = 1;

// Wrap the app once (see App.jsx) with <ToastProvider>, then call useToast().showToast(...)
// from anywhere. Toasts self-dismiss after `duration` ms (default 5s) and can be closed early.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, variant = 'info', duration = 5000) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm shadow-md ${VARIANT_STYLES[t.variant] ?? VARIANT_STYLES.info}`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-current opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
