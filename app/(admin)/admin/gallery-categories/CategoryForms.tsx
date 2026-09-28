'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import {
  deleteCategoryAction,
  moveCategoryAction,
  renumberCategoriesAction,
  saveCategoryAction,
  toggleCategoryAction,
} from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '' };

export interface CategoryValues {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
  status: string;
  coverUrl: string;
}

/**
 * Adding or editing one category.
 *
 * The quick-add chips are the common names an institute uses year after year;
 * they fill the name field rather than saving, so the admin still chooses the
 * order and the cover.
 */
export function CategoryForm({
  values,
  suggestions,
  cancelHref,
  labels,
}: {
  values: CategoryValues;
  suggestions: string[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveCategoryAction, EMPTY);
  const [name, setName] = useState(values.name);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-4" id="categoryForm">
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
        {labels.name} *
        <input
          name="name"
          required
          maxLength={150}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.nameHelp}</span>
      </label>

      {!editing && suggestions.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-muted">{labels.suggest}</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setName(suggestion)}
              className={SMALL}
            >
              {suggestion}
            </button>
          ))}
        </p>
      )}

      <label className="block text-xs font-medium text-ink">
        {labels.description}
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={values.description}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.descriptionHelp}
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.sort}
          <input
            type="number"
            name="sort_order"
            min={0}
            max={99999}
            defaultValue={values.sortOrder}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {editing ? labels.sortHelp : labels.sortHelpNew}
          </span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select name="status" defaultValue={values.status} className={`mt-1 ${CONTROL}`}>
            <option value="active">{labels.statusActive}</option>
            <option value="hidden">{labels.statusHidden}</option>
          </select>
        </label>
      </div>

      {values.coverUrl !== '' && (
        <div>
          <span className="block text-xs font-medium text-ink">{labels.currentCover}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={values.coverUrl}
            alt=""
            className="mt-1 aspect-video w-full max-w-72 rounded-orbit border border-line-soft object-cover"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="remove_cover"
              value="1"
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span>{labels.removeCover}</span>
          </label>
        </div>
      )}

      <label className="block text-xs font-medium text-ink">
        {labels.cover}
        <input
          type="file"
          name="cover_image"
          accept="image/jpeg,image/png,image/webp"
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.coverHelp}
          {editing && values.coverUrl !== '' ? ` ${labels.coverKeep}` : ''}
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

/** Show / hide, up / down, and delete for one category row. */
export function CategoryRowActions({
  categoryId,
  status,
  images,
  labels,
}: {
  categoryId: number;
  status: string;
  images: number;
  labels: Record<string, string>;
}) {
  const [toggleState, toggle, togglePending] = useActionState(toggleCategoryAction, EMPTY);
  const [deleteState, remove, removePending] = useActionState(deleteCategoryAction, EMPTY);
  const [asking, setAsking] = useState(false);

  const error = toggleState.errors[0] ?? deleteState.errors[0] ?? '';

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <form action={moveCategoryAction} className="inline">
        <input type="hidden" name="id" value={categoryId} />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" title={labels.moveUp} aria-label={labels.moveUp} className={SMALL}>
          <i className="bi bi-arrow-up" aria-hidden />
        </button>
      </form>

      <form action={moveCategoryAction} className="inline">
        <input type="hidden" name="id" value={categoryId} />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" title={labels.moveDown} aria-label={labels.moveDown} className={SMALL}>
          <i className="bi bi-arrow-down" aria-hidden />
        </button>
      </form>

      <form action={toggle} className="inline">
        <input type="hidden" name="id" value={categoryId} />
        <button type="submit" disabled={togglePending} className={`${SMALL} disabled:opacity-60`}>
          {status === 'active' ? labels.hide : labels.show}
        </button>
      </form>

      <Link
        href={`/admin/gallery-categories?edit=${categoryId}#categoryForm`}
        title={labels.edit}
        aria-label={labels.edit}
        className={SMALL}
      >
        <i className="bi bi-pencil" aria-hidden />
      </Link>

      {images > 0 ? (
        <span title={labels.blockedHint} className={`${SMALL} opacity-50`}>
          <i className="bi bi-trash" aria-hidden />
        </span>
      ) : asking ? (
        <form action={remove} className="inline-flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="id" value={categoryId} />
          <span className="text-xs text-ink-muted">{labels.confirm}</span>
          <button
            type="submit"
            disabled={removePending}
            className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
          >
            {labels.remove}
          </button>
          <button type="button" onClick={() => setAsking(false)} className={SMALL}>
            {labels.cancel}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          title={labels.remove}
          aria-label={labels.remove}
          className={`${SMALL} text-red-600`}
        >
          <i className="bi bi-trash" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Renumbering every category 1, 2, 3… in its current order. */
export function RenumberButton({ labels }: { labels: Record<string, string> }) {
  const [state, action, pending] = useActionState(renumberCategoriesAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.message !== '') return <Alert tone="success">{state.message}</Alert>;

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={SMALL}>
        <i className="bi bi-sort-numeric-down me-1" aria-hidden /> {labels.renumber}
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-muted">{labels.confirm}</span>
      <button type="submit" disabled={pending} className={`${SMALL} disabled:opacity-60`}>
        {labels.renumber}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={SMALL}>
        {labels.cancel}
      </button>
    </form>
  );
}
