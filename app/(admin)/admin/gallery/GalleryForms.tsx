'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge } from '@/components/ui/Feedback';
import {
  bulkImagesAction,
  deleteImageAction,
  saveImageAction,
  uploadImagesAction,
} from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '', items: [] as never[] };

export interface CategoryOption {
  id: number;
  label: string;
}

/**
 * Uploading images to one category.
 *
 * The per-file result list is the point: a rejected picture says which file and
 * why, while everything else is already saved. One error for the whole upload
 * would leave nobody knowing what happened to the other nine files.
 */
export function UploadForm({
  categories,
  initialCategory,
  maxMb,
  labels,
}: {
  categories: CategoryOption[];
  initialCategory: number;
  maxMb: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(uploadImagesAction, EMPTY);
  const [chosen, setChosen] = useState(0);

  return (
    <form action={action} className="space-y-4">
      {state.errors.length > 0 && (
        <Alert tone="warning">
          <ul className="list-inside list-disc space-y-1">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <label className="block text-xs font-medium text-ink">
        {labels.category} *
        <select
          name="category_id"
          required
          defaultValue={String(initialCategory || '')}
          className={`mt-1 ${CONTROL}`}
        >
          <option value="">{labels.categoryChoose}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.categoryHelp}{' '}
          <Link href="/admin/gallery-categories" className="text-primary hover:underline">
            {labels.categoryLink}
          </Link>
        </span>
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.images} *
        <input
          type="file"
          name="images"
          multiple
          required
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setChosen(event.currentTarget.files?.length ?? 0)}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.dropHelp.replace('{size}', String(maxMb))}
        </span>
        {chosen > 0 && (
          <span className="mt-1 block text-[11px] font-normal text-primary">
            {labels.ready.replace('{count}', String(chosen))}
          </span>
        )}
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.title}
        <input
          name="title"
          maxLength={255}
          placeholder={labels.titlePlaceholder}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.titleHelp}
        </span>
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.description}
        <textarea
          name="description"
          rows={2}
          maxLength={5000}
          placeholder={labels.descriptionPlaceholder}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.eventDate}
          <input type="date" name="event_date" className={`mt-1 ${CONTROL}`} />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select name="status" defaultValue="active" className={`mt-1 ${CONTROL}`}>
            <option value="active">{labels.statusActive}</option>
            <option value="inactive">{labels.statusInactive}</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="featured"
          value="1"
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <span>{labels.featured}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? labels.uploading : labels.upload}
      </button>

      {state.items.length > 0 && (
        <div className="rounded-orbit border border-line-soft p-3">
          <p className="text-xs font-semibold text-ink-heading">{labels.reportTitle}</p>
          <ul className="mt-2 space-y-1 text-xs">
            {(state.items as unknown as { name: string; ok: boolean; message: string; title: string }[]).map(
              (item, index) => (
                <li key={`${item.name}-${index}`} className="flex flex-wrap items-center gap-2">
                  <Badge tone={item.ok ? 'success' : 'danger'}>
                    {item.ok ? labels.badgeSaved : labels.badgeRejected}
                  </Badge>
                  <span className="text-ink">{item.name}</span>
                  <span className="text-ink-muted">
                    {item.ok ? labels.itemSaved.replace('{title}', item.title) : item.message}
                  </span>
                </li>
              )
            )}
          </ul>
        </div>
      )}
    </form>
  );
}

export interface ImageValues {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  eventDate: string;
  featured: boolean;
  status: string;
  sortOrder: number;
  imageUrl: string;
}

/** Editing one image's details — the file itself is never replaced here. */
export function ImageForm({
  values,
  categories,
  cancelHref,
  labels,
}: {
  values: ImageValues;
  categories: CategoryOption[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveImageAction, EMPTY);

  return (
    <form action={action} className="space-y-4" id="imageForm">
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

      {values.imageUrl !== '' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={values.imageUrl}
          alt=""
          className="aspect-video w-full rounded-orbit border border-line-soft object-cover"
        />
      )}

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
          rows={2}
          maxLength={5000}
          defaultValue={values.description}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.category}
        <select
          name="category_id"
          defaultValue={String(values.categoryId || '')}
          className={`mt-1 ${CONTROL}`}
        >
          <option value="">{labels.categoryNone}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.eventDate}
          <input
            type="date"
            name="event_date"
            defaultValue={values.eventDate}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

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
            {labels.sortHelp}
          </span>
        </label>
      </div>

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

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="featured"
          value="1"
          defaultChecked={values.featured}
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <span>{labels.featured}</span>
      </label>
      <p className="text-[11px] text-ink-muted">{labels.featuredHelp}</p>

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
          {labels.cancelEdit}
        </Link>
      </div>
    </form>
  );
}

export interface ImageRow {
  id: number;
  title: string;
  category: string;
  categoryHidden: boolean;
  imageUrl: string;
  status: string;
  featured: boolean;
  eventDate: string;
  sortOrder: string;
}

/**
 * The image grid with its bulk bar.
 *
 * Selection lives here rather than in the URL: it is per-page work, and a
 * selection that survived a filter change would act on pictures nobody could
 * see.
 */
export function ImageGrid({
  rows,
  categories,
  editHref,
  labels,
}: {
  rows: ImageRow[];
  categories: CategoryOption[];
  editHref: (id: number) => string;
  labels: Record<string, string>;
}) {
  const [bulkState, bulk, bulkPending] = useActionState(bulkImagesAction, EMPTY);
  const [deleteState, remove, removePending] = useActionState(deleteImageAction, EMPTY);
  const [selected, setSelected] = useState<number[]>([]);
  const [what, setWhat] = useState('');
  const [asking, setAsking] = useState(0);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );

  const allOn = rows.length > 0 && selected.length === rows.length;
  const errors = [...bulkState.errors, ...deleteState.errors];
  const message = bulkState.message !== '' ? bulkState.message : deleteState.message;

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Alert tone="warning">
          <ul className="list-inside list-disc space-y-1">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
      {message !== '' && <Alert tone="success">{message}</Alert>}

      <form action={bulk} className="flex flex-wrap items-end gap-2 rounded-orbit bg-surface-2 p-3">
        {selected.map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={allOn}
            onChange={(event) =>
              setSelected(event.currentTarget.checked ? rows.map((row) => row.id) : [])
            }
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
          />
          <span>{labels.selectAll}</span>
        </label>

        <span className="text-xs text-ink-muted">
          {labels.selected.replace('{count}', String(selected.length))}
        </span>

        <label className="ms-auto block text-xs font-medium text-ink">
          <span className="sr-only">{labels.bulkLabel}</span>
          <select
            name="bulk_action"
            value={what}
            onChange={(event) => {
              setWhat(event.currentTarget.value);
              setConfirmBulk(false);
            }}
            className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">{labels.bulkChoose}</option>
            <option value="activate">{labels.bulkActivate}</option>
            <option value="deactivate">{labels.bulkDeactivate}</option>
            <option value="move">{labels.bulkMove}</option>
            <option value="delete">{labels.bulkDelete}</option>
          </select>
        </label>

        {what === 'move' && (
          <select
            name="target_category"
            defaultValue=""
            className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">{labels.bulkTarget}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        )}

        {/* Deleting many pictures at once asks first; the other actions undo easily. */}
        {what === 'delete' && !confirmBulk ? (
          <button
            type="button"
            onClick={() => setConfirmBulk(true)}
            disabled={selected.length === 0}
            className="rounded-orbit border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-surface disabled:opacity-50"
          >
            {labels.apply}
          </button>
        ) : (
          <>
            {what === 'delete' && (
              <span className="text-xs text-ink-muted">
                {labels.bulkDeleteConfirm.replace('{count}', String(selected.length))}
              </span>
            )}
            <button
              type="submit"
              disabled={bulkPending || selected.length === 0 || what === ''}
              className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {labels.apply}
            </button>
          </>
        )}
      </form>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-orbit border border-line bg-surface p-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                onChange={() => toggle(row.id)}
                aria-label={labels.selectItem.replace('{title}', row.title)}
                className="mt-1 h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
              />
              <div className="min-w-0 flex-1">
                {row.imageUrl !== '' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="aspect-video w-full rounded-orbit bg-surface-2 object-cover"
                  />
                ) : (
                  <span className="flex aspect-video w-full items-center justify-center rounded-orbit bg-surface-2 text-xs text-ink-muted">
                    {labels.noFile}
                  </span>
                )}

                <p className="mt-2 truncate font-medium text-ink" title={row.title}>
                  {row.title}
                </p>

                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge tone={row.status === 'active' ? 'success' : 'neutral'}>
                    {row.status === 'active' ? labels.visible : labels.hidden}
                  </Badge>
                  {row.featured && <Badge tone="info">{labels.featured}</Badge>}
                  <span className="text-ink-muted">
                    {row.category !== '' ? row.category : labels.uncategorised}
                  </span>
                  {row.categoryHidden && (
                    <Badge tone="warning">{labels.categoryHidden}</Badge>
                  )}
                </p>

                {row.eventDate !== '' && (
                  <p className="mt-1 text-xs text-ink-muted">{row.eventDate}</p>
                )}

                <p className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Link href={editHref(row.id)} className={SMALL}>
                    <i className="bi bi-pencil me-1" aria-hidden /> {labels.edit}
                  </Link>
                  {row.imageUrl !== '' && (
                    <a
                      href={row.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={SMALL}
                    >
                      {labels.openFull}
                    </a>
                  )}

                  {asking === row.id ? (
                    <form action={remove} className="inline-flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="id" value={row.id} />
                      <span className="text-xs text-ink-muted">{labels.deleteConfirm}</span>
                      <button
                        type="submit"
                        disabled={removePending}
                        className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
                      >
                        {labels.remove}
                      </button>
                      <button type="button" onClick={() => setAsking(0)} className={SMALL}>
                        {labels.cancel}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAsking(row.id)}
                      title={labels.remove}
                      aria-label={labels.remove}
                      className={`${SMALL} text-red-600`}
                    >
                      <i className="bi bi-trash" aria-hidden />
                    </button>
                  )}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
