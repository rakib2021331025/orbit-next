'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { deleteAchievementAction, saveAchievementAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface AchievementValues {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
}

/** Adding or editing one achievement. */
export function AchievementForm({
  values,
  labels,
}: {
  values: AchievementValues;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveAchievementAction, EMPTY);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-4" id="achievementForm">
      <input type="hidden" name="id" value={values.id} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <label className="block text-xs font-medium text-ink">
        {labels.title} *
        <input
          name="title"
          required
          maxLength={255}
          defaultValue={values.title}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.description}
        <textarea
          name="description"
          rows={4}
          maxLength={20000}
          defaultValue={values.description}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.descriptionHelp}
        </span>
      </label>

      {editing && values.imageUrl !== '' && (
        <div>
          <span className="block text-xs font-medium text-ink">{labels.currentImage}</span>
          {/* A plain <img>: the file comes from the upload store, not the build. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={values.imageUrl}
            alt=""
            className="mt-1 aspect-[4/3] w-full max-w-72 rounded-orbit border border-line-soft object-cover"
          />
        </div>
      )}

      <label className="block text-xs font-medium text-ink">
        {labels.image} {!editing && '*'}
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          required={!editing}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.imageHelp}
          {editing ? ` ${labels.imageKeep}` : ''}
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
        {editing && (
          <Link
            href="/admin/achievements"
            className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {labels.cancelEdit}
          </Link>
        )}
      </div>
    </form>
  );
}

/** Deleting one achievement, image and all. */
export function DeleteAchievement({
  achievementId,
  labels,
}: {
  achievementId: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deleteAchievementAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.error !== '') return <span className="text-xs text-red-600">{state.error}</span>;

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        title={labels.remove}
        aria-label={labels.remove}
        className={`${SMALL} text-red-600`}
      >
        <i className="bi bi-trash" aria-hidden />
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={achievementId} />
      <span className="text-xs text-ink-muted">{labels.confirm}</span>
      <button
        type="submit"
        disabled={pending}
        className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
      >
        {labels.remove}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={SMALL}>
        {labels.cancel}
      </button>
    </form>
  );
}
