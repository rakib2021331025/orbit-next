'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { deleteTrialAction, saveTrialAction, toggleTrialAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '' };

export interface TrialValues {
  id: number;
  title: string;
  teacher: string;
  course: string;
  description: string;
  videoLink: string;
  status: string;
  thumbUrl: string;
}

/** Adding or editing one trial class. */
export function TrialForm({
  values,
  cancelHref,
  labels,
}: {
  values: TrialValues;
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveTrialAction, EMPTY);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-4" id="trialForm">
      <input type="hidden" name="id" value={values.id} />

      {state.errors.length > 0 && (
        <Alert tone="danger">
          <ul className="list-inside list-disc space-y-1">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.teacher} *
          <input
            name="teacher_name"
            required
            maxLength={255}
            defaultValue={values.teacher}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.course} *
          <input
            name="course_name"
            required
            maxLength={255}
            defaultValue={values.course}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-ink">
        {labels.description} *
        <textarea
          name="description"
          required
          rows={4}
          maxLength={20000}
          defaultValue={values.description}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.video} *
        <input
          name="video_url"
          required
          maxLength={500}
          defaultValue={values.videoLink}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.videoHelp}
        </span>
      </label>

      {values.thumbUrl !== '' && (
        <div>
          <span className="block text-xs font-medium text-ink">{labels.currentThumb}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={values.thumbUrl}
            alt=""
            className="mt-1 aspect-video w-full max-w-72 rounded-orbit border border-line-soft object-cover"
          />
        </div>
      )}

      <label className="block text-xs font-medium text-ink">
        {labels.thumb} {!editing && '*'}
        <input
          type="file"
          name="thumbnail"
          accept="image/jpeg,image/png,image/webp"
          required={!editing}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.thumbHelp}
          {editing ? ` ${labels.thumbKeep}` : ''}
        </span>
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.status}
        <select name="status" defaultValue={values.status} className={`mt-1 ${CONTROL}`}>
          <option value="active">{labels.statusActive}</option>
          <option value="inactive">{labels.statusInactive}</option>
        </select>
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.statusHelp}
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
            href={cancelHref}
            className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {labels.cancelEdit}
          </Link>
        )}
      </div>
    </form>
  );
}

/** Showing or hiding one trial class on the public site. */
export function TrialToggle({
  trialId,
  isActive,
  labels,
}: {
  trialId: number;
  isActive: boolean;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(toggleTrialAction, EMPTY);

  if (state.errors.length > 0) {
    return <span className="text-xs text-red-600">{state.errors[0]}</span>;
  }

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={trialId} />
      <button type="submit" disabled={pending} className={`${SMALL} disabled:opacity-60`}>
        {isActive ? labels.deactivate : labels.activate}
      </button>
    </form>
  );
}

/** Deleting a trial class and its thumbnail. */
export function DeleteTrial({
  trialId,
  labels,
}: {
  trialId: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deleteTrialAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.errors.length > 0) {
    return <span className="text-xs text-red-600">{state.errors[0]}</span>;
  }

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
      <input type="hidden" name="id" value={trialId} />
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
