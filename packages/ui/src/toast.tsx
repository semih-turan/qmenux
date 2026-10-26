'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface ToastInput {
  message: string;
  /** e.g. Geri al. Undo is offered only for reversible actions that the server already confirmed. */
  action?: { label: string; onAction: () => void | Promise<void> };
  durationMs?: number;
}

export interface ToastItem extends ToastInput {
  id: number;
  leaving?: boolean;
}

const Ctx = createContext<((t: ToastInput) => void) | null>(null);

export function useToast() {
  const show = useContext(Ctx);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}

const MAX = 3;

/**
 * Adds a toast to the stack. Saving twice must not pile up two identical confirmations, so a plain
 * message replaces its twin (the new copy is re-announced); toasts with an action are never merged.
 */
export function enqueueToast(all: ToastItem[], t: ToastInput, id: number): ToastItem[] {
  const rest = t.action ? all : all.filter((x) => x.action || x.message !== t.message);
  return [...rest.slice(-(MAX - 1)), { ...t, id }];
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    timers.current.set(
      id,
      setTimeout(() => {
        setItems((all) => all.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, 160),
    );
  }, []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((all) => enqueueToast(all, t, id));
      timers.current.set(id, setTimeout(() => dismiss(id), t.durationMs ?? (t.action ? 6000 : 4000)));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="qx-toaster" role="status" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className="qx-toast" data-leaving={t.leaving || undefined}>
            <span className="qx-toast__msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="qx-toast__action"
                onClick={async () => {
                  clearTimeout(timers.current.get(t.id));
                  dismiss(t.id);
                  await t.action!.onAction();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
