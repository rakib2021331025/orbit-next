'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import type { ClassAction, ClassFormState } from './ClassForm';

const EMPTY: ClassFormState = { error: '', message: '' };

export interface MaterialItem {
  id: number;
  title: string;
  url: string;
  type: string;
  size: string;
}

/**
 * The handouts attached to one class.
 *
 * Collapsed by default: a list of twenty classes with an upload form open under
 * each is unreadable, and most of the time a teacher is looking at the schedule,
 * not the files.
 *
 * Uploading tells the class's students, which is why the form lives here rather
 * than behind a separate screen — the teacher can see who it is for.
 */
export function MaterialPanel({
  actions,
  classId,
  materials,
  labels,
}: {
  actions: { add: ClassAction; remove: ClassAction };
  classId: number;
  materials: MaterialItem[];
  labels: {
    heading: string;
    count: string;
    none: string;
    title: string;
    titlePlaceholder: string;
    file: string;
    help: string;
    upload: string;
    remove: string;
    confirmRemove: string;
    dismiss: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [addState, addAction, addPending] = useActionState(actions.add, EMPTY);
  const [removeState, removeAction, removePending] = useActionState(actions.remove, EMPTY);
  const [confirming, setConfirming] = useState(0);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition hover:text-primary"
      >
        <i className={open ? 'bi bi-chevron-down' : 'bi bi-chevron-right'} aria-hidden />
        <i className="bi bi-paperclip" aria-hidden />
        {labels.heading}
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px]">{labels.count}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-orbit border border-line-soft bg-surface-2/50 p-3">
          {addState.error !== '' && <Alert tone="danger">{addState.error}</Alert>}
          {addState.message !== '' && <Alert tone="success">{addState.message}</Alert>}
          {removeState.error !== '' && <Alert tone="danger">{removeState.error}</Alert>}

          {materials.length === 0 ? (
            <p className="text-xs text-ink-muted">{labels.none}</p>
          ) : (
            <ul className="space-y-1.5">
              {materials.map((material) => (
                <li key={material.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <a
                    href={material.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 truncate font-medium text-ink transition hover:text-primary"
                  >
                    <i className="bi bi-file-earmark-arrow-down me-1.5" aria-hidden />
                    {material.title}
                  </a>
                  <span className="text-xs uppercase text-ink-muted">{material.type}</span>
                  <span className="text-xs text-ink-muted">{material.size}</span>

                  {confirming === material.id ? (
                    <form action={removeAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="material_id" value={material.id} />
                      <span className="text-xs text-ink">{labels.confirmRemove}</span>
                      <button
                        type="submit"
                        disabled={removePending}
                        className="rounded-orbit bg-red-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-red-700"
                      >
                        {labels.remove}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(0)}
                        className="rounded-orbit border border-line px-2 py-0.5 text-xs text-ink"
                      >
                        {labels.dismiss}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(material.id)}
                      className="rounded-orbit border border-red-300 px-2 py-0.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      {labels.remove}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form action={addAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="live_class_id" value={classId} />

            <label className="block text-xs font-medium text-ink">
              {labels.title}
              <input
                name="material_title"
                required
                maxLength={255}
                placeholder={labels.titlePlaceholder}
                className="mt-1 w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </label>

            <label className="block text-xs font-medium text-ink">
              {labels.file}
              <input
                type="file"
                name="material_file"
                required
                className="mt-1 w-full rounded-orbit border border-line bg-surface px-3 py-1.5 text-sm text-ink file:me-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
              />
            </label>

            <button
              type="submit"
              disabled={addPending}
              className="rounded-orbit bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
            >
              {labels.upload}
            </button>

            <p className="text-xs text-ink-muted sm:col-span-3">{labels.help}</p>
          </form>
        </div>
      )}
    </div>
  );
}
