'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { deletePrintableAction, savePrintableAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '' };

export interface PrintableValues {
  id: number;
  title: string;
  category: string;
  customCategory: string;
  description: string;
  imageUrl: string;
}

/**
 * Adding or editing one printable document.
 *
 * "Other" reveals a name box, because the categories are presets and an
 * institute always has one the list does not cover — the original stores the
 * typed name in place of the preset.
 */
export function PrintableForm({
  values,
  categories,
  maxMb,
  cancelHref,
  labels,
}: {
  values: PrintableValues;
  categories: { value: string; label: string }[];
  maxMb: number;
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(savePrintableAction, EMPTY);
  const [category, setCategory] = useState(values.category);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-4" id="printableForm">
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
          maxLength={200}
          defaultValue={values.title}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.titleHint}
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.category}
          <select
            name="category"
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          >
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {category === 'other' && (
          <label className="block text-xs font-medium text-ink">
            {labels.customCategory}
            <input
              name="custom_category"
              maxLength={80}
              defaultValue={values.customCategory}
              className={`mt-1 ${CONTROL}`}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.customHint}
            </span>
          </label>
        )}
      </div>

      <label className="block text-xs font-medium text-ink">
        {labels.description}
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={values.description}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {editing ? labels.imageReplace : `${labels.image} *`}
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          required={!editing}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.imageHint.replace('{size}', String(maxMb))}
          {editing ? ` ${labels.imageKeep}` : ''}
        </span>
      </label>

      <div>
        <span className="block text-xs font-medium text-ink">{labels.preview}</span>
        {values.imageUrl !== '' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={values.imageUrl}
            alt=""
            className="mt-1 max-h-72 w-full rounded-orbit border border-line-soft object-contain"
          />
        ) : (
          <p className="mt-1 text-xs text-ink-muted">{labels.previewEmpty}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
        <Link
          href={cancelHref}
          className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {labels.back}
        </Link>
      </div>
    </form>
  );
}

/** Deleting one document and its image. */
export function DeletePrintable({
  documentId,
  labels,
}: {
  documentId: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deletePrintableAction, EMPTY);
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
      <input type="hidden" name="id" value={documentId} />
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
