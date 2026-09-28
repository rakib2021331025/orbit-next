'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { deleteGiftAction, saveGiftAction, toggleGiftAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '' };

export interface GiftValues {
  id: number;
  name: string;
  nameBn: string;
  description: string;
  descriptionBn: string;
  sortOrder: number;
  isActive: boolean;
  imageUrl: string;
}

/**
 * One gift, with a live preview of the homepage card.
 *
 * The preview is here because the Bangla fields are optional and the fallback
 * is not obvious: a visitor reading Bangla sees the Bangla name when it is
 * filled in, and the first name in both languages when it is not.
 */
export function GiftForm({
  values,
  labels,
}: {
  values: GiftValues;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveGiftAction, EMPTY);
  const [name, setName] = useState(values.name);
  const [description, setDescription] = useState(values.description);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-6">
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

      <div className="grid gap-4 sm:grid-cols-2">
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
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.nameBn}
          <input
            name="name_bn"
            maxLength={150}
            lang="bn"
            defaultValue={values.nameBn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.description}
          <textarea
            name="description"
            rows={3}
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.descriptionBn}
          <textarea
            name="description_bn"
            rows={3}
            maxLength={500}
            lang="bn"
            defaultValue={values.descriptionBn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <p className="text-[11px] text-ink-muted sm:col-span-2">{labels.nameHint}</p>

        <label className="block text-xs font-medium text-ink">
          {labels.order}
          <input
            type="number"
            name="sort_order"
            min={0}
            max={9999}
            defaultValue={values.sortOrder}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.orderHint}
          </span>
        </label>

        <label className="flex items-end gap-2 pb-2 text-sm text-ink">
          <input
            type="checkbox"
            name="is_active"
            value="1"
            defaultChecked={values.isActive}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
          />
          <span>{labels.active}</span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-ink">
            {labels.image}
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              className={`mt-1 ${CONTROL}`}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.imageHint}
            </span>
          </label>

          {values.imageUrl !== '' && (
            <label className="mt-2 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="remove_image"
                value="1"
                className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
              />
              <span>{labels.removeImage}</span>
            </label>
          )}
        </div>

        <div>
          <span className="block text-xs font-medium text-ink">{labels.preview}</span>
          <div className="mt-1 rounded-orbit border border-line-soft bg-surface p-4 text-center">
            {values.imageUrl !== '' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.imageUrl}
                alt=""
                className="mx-auto max-h-40 w-auto rounded-orbit object-contain"
              />
            ) : (
              <span className="block text-3xl text-ink-muted">
                <i className="bi bi-gift" aria-hidden />
              </span>
            )}
            <span className="mt-2 block font-semibold text-ink-heading">
              {name !== '' ? name : labels.name}
            </span>
            {description !== '' && (
              <span className="mt-1 block text-sm text-ink-muted">{description}</span>
            )}
          </div>
        </div>
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
          href="/admin/gifts"
          className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {editing ? labels.back : labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/** Showing or hiding one gift on the homepage. */
export function GiftToggle({
  giftId,
  isActive,
  labels,
}: {
  giftId: number;
  isActive: boolean;
  labels: Record<string, string>;
}) {
  return (
    <form action={toggleGiftAction} className="inline">
      <input type="hidden" name="id" value={giftId} />
      <button type="submit" className={SMALL}>
        {isActive ? labels.deactivate : labels.activate}
      </button>
    </form>
  );
}

/** Deleting a gift, image and all. */
export function DeleteGift({
  giftId,
  labels,
}: {
  giftId: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deleteGiftAction, EMPTY);
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
      <input type="hidden" name="id" value={giftId} />
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
