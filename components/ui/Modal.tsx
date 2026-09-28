'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * A modal built on the native `<dialog>`.
 *
 * `showModal()` gives focus trapping, Escape-to-close, the backdrop and inertness
 * of the rest of the page for free. A hand-rolled div would have to reimplement
 * all four, and usually reimplements three.
 */
export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Escape fires 'cancel' and would close the dialog without telling React,
      // leaving the parent's `open` state out of step with what is on screen.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className={cn(
        'w-[calc(100vw-2rem)] rounded-orbit border border-line bg-surface p-0 text-ink shadow-orbit-lg backdrop:bg-black/50',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-3xl'
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
        <h2 className="font-head text-base font-semibold text-ink-heading">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="-me-1 grid h-8 w-8 place-items-center rounded-full text-ink-muted transition hover:bg-surface-3 hover:text-ink"
        >
          <span aria-hidden>&times;</span>
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft bg-surface-2 px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}

/**
 * A confirmation dialog for destructive actions, submitted as a form so the work
 * happens in a server action.
 *
 * Deleting a student or a payment is not undoable, so it asks first — and the
 * message names what is being deleted, because "Are you sure?" alone gives the
 * user nothing to check.
 */
export function ConfirmModal({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  cancelLabel,
  closeLabel,
  action,
  hidden,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  hidden?: Record<string, string | number>;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" closeLabel={closeLabel}>
      <p className="text-sm text-ink">{body}</p>
      <form action={action} className="mt-5 flex flex-wrap justify-end gap-2">
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={String(value)} />
        ))}
        <button
          type="button"
          onClick={onClose}
          className="rounded-orbit border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          className="rounded-orbit bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
        >
          {confirmLabel}
        </button>
      </form>
    </Modal>
  );
}
