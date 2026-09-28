'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from './Feedback';

/**
 * Transient confirmations ("Saved", "Attendance recorded").
 *
 * The region is `aria-live="polite"`, so a screen reader hears the message after
 * finishing its current sentence. Toasts are for confirmations only — anything a
 * user must act on, or must still see in ten seconds, belongs in an `<Alert>` on
 * the page, not in something that vanishes.
 */

export interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<{ push: (message: string, tone?: Tone) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, tone, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  const tones: Record<Tone, string> = {
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    danger: 'border-red-300 bg-red-50 text-red-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
    neutral: 'border-line bg-surface text-ink',
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-orbit border px-4 py-3 text-sm shadow-orbit-lg',
              tones[toast.tone]
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns a no-op when there is no provider, so a component can announce
 * something without caring whether the tree it is mounted in has one.
 */
export function useToast() {
  return useContext(ToastContext) ?? { push: () => {} };
}
