'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

type Variant = 'success' | 'error' | 'info';
export type ToastAction = { label: string; onClick: () => void };
type ToastOptions = { action?: ToastAction; durationMs?: number };
type Toast = { id: string; message: string; variant: Variant; action?: ToastAction };
type ToastContextValue = {
  notify: (message: string, variant?: Variant, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, variant: Variant = 'success', options: ToastOptions = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, variant, action: options.action }]);
      // Toasts with an action stay longer so there is time to reach the button.
      const duration = options.durationMs ?? (options.action ? 7000 : 4000);
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-[70] flex flex-col items-center gap-2 p-4 md:bottom-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-md bg-surface py-2 pl-4 pr-2 text-sm shadow-e2 ring-1 ring-border"
          >
            {t.variant === 'success' && <CheckCircle2 size={18} className="shrink-0 text-ok" aria-hidden />}
            {t.variant === 'error' && <XCircle size={18} className="shrink-0 text-danger" aria-hidden />}
            {t.variant === 'info' && <Info size={18} className="shrink-0 text-ink-2" aria-hidden />}
            <span className="flex-1 py-1.5">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="min-h-11 rounded-md px-3 font-semibold text-primary hover:bg-primary-tint"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) return { notify: () => undefined };
  return ctx;
}
