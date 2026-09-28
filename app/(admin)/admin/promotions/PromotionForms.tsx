'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { deletePromotionAction, savePromotionAction, togglePromotionAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '' };

export interface PromotionValues {
  id: number;
  title: string;
  titleBn: string;
  description: string;
  descriptionBn: string;
  offerText: string;
  offerTextBn: string;
  discountPercent: string;
  buttonText: string;
  buttonTextBn: string;
  buttonUrl: string;
  position: string;
  style: string;
  sortOrder: number;
  isActive: boolean;
  startAt: string;
  endAt: string;
  imageUrl: string;
}

/** The four styles, as the public site paints them. */
const STYLE_SWATCH: Record<string, string> = {
  green: 'bg-emerald-700 text-white',
  yellow: 'bg-amber-300 text-emerald-950',
  dark: 'bg-emerald-950 text-white',
  light: 'bg-white text-emerald-950 border border-line',
};

/**
 * One promotion.
 *
 * The preview shows the offer badge, the title and the button as a visitor would
 * see them, because the four styles and the offer/discount fallback are easier
 * to judge by eye than from field names.
 */
export function PromotionForm({
  values,
  positions,
  styles,
  labels,
}: {
  values: PromotionValues;
  positions: { value: string; label: string }[];
  styles: { value: string; label: string }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(savePromotionAction, EMPTY);
  const [title, setTitle] = useState(values.title);
  const [offer, setOffer] = useState(values.offerText);
  const [percent, setPercent] = useState(values.discountPercent);
  const [buttonText, setButtonText] = useState(values.buttonText);
  const [style, setStyle] = useState(values.style);
  const editing = values.id > 0;

  const badge =
    offer.trim() !== ''
      ? offer
      : percent.trim() !== ''
        ? `${percent}% OFF`
        : '';

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
            name="title"
            required
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.nameBn}
          <input
            name="title_bn"
            maxLength={255}
            lang="bn"
            defaultValue={values.titleBn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

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
          {labels.descriptionBn}
          <textarea
            name="description_bn"
            rows={3}
            maxLength={2000}
            lang="bn"
            defaultValue={values.descriptionBn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.offer}
          <input
            name="offer_text"
            maxLength={60}
            placeholder={labels.offerPlaceholder}
            value={offer}
            onChange={(event) => setOffer(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.offerBn}
          <input
            name="offer_text_bn"
            maxLength={60}
            lang="bn"
            defaultValue={values.offerTextBn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.percent}
          <input
            name="discount_percent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={percent}
            onChange={(event) => setPercent(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.percentHint}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-xs font-medium text-ink">
            {labels.button}
            <input
              name="button_text"
              maxLength={80}
              value={buttonText}
              onChange={(event) => setButtonText(event.currentTarget.value)}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
          <label className="block text-xs font-medium text-ink">
            {labels.buttonBn}
            <input
              name="button_text_bn"
              maxLength={80}
              lang="bn"
              defaultValue={values.buttonTextBn}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </div>

        <label className="block text-xs font-medium text-ink sm:col-span-2">
          {labels.url}
          <input
            name="button_url"
            maxLength={500}
            defaultValue={values.buttonUrl}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.urlHint}
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium text-ink">
          {labels.position}
          <select
            name="display_position"
            defaultValue={values.position}
            className={`mt-1 ${CONTROL}`}
          >
            {positions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.style}
          <select
            name="style"
            value={style}
            onChange={(event) => setStyle(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          >
            {styles.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.order}
          <input
            type="number"
            name="sort_order"
            defaultValue={values.sortOrder}
            className={`mt-1 ${CONTROL}`}
          />
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

        <p className="text-[11px] text-ink-muted sm:col-span-2 lg:col-span-4">
          {labels.positionHint}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.start}
          <input
            type="datetime-local"
            name="start_at"
            defaultValue={values.startAt}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.end}
          <input
            type="datetime-local"
            name="end_at"
            defaultValue={values.endAt}
            className={`mt-1 ${CONTROL}`}
          />
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
          <div
            className={`mt-1 rounded-orbit p-4 ${STYLE_SWATCH[style] ?? STYLE_SWATCH.green}`}
          >
            {badge !== '' && (
              <span className="inline-block rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold">
                {badge}
              </span>
            )}
            <span className="mt-1 block text-lg font-bold">
              {title !== '' ? title : labels.name}
            </span>
            {buttonText.trim() !== '' && (
              <span className="mt-2 inline-block rounded-orbit bg-white/90 px-3 py-1 text-sm font-semibold text-emerald-950">
                {buttonText}
              </span>
            )}
          </div>
          {values.imageUrl !== '' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={values.imageUrl}
              alt=""
              className="mt-2 w-full rounded-orbit border border-line-soft object-cover"
            />
          )}
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
          href="/admin/promotions"
          className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {editing ? labels.back : labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/** Switching one promotion on or off. */
export function PromotionToggle({
  promotionId,
  isActive,
  labels,
}: {
  promotionId: number;
  isActive: boolean;
  labels: Record<string, string>;
}) {
  return (
    <form action={togglePromotionAction} className="inline">
      <input type="hidden" name="id" value={promotionId} />
      <button type="submit" className={SMALL}>
        {isActive ? labels.deactivate : labels.activate}
      </button>
    </form>
  );
}

/** Deleting a promotion, image and all. */
export function DeletePromotion({
  promotionId,
  labels,
}: {
  promotionId: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deletePromotionAction, EMPTY);
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
      <input type="hidden" name="id" value={promotionId} />
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
