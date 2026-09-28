'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { inquiryAction, saveNotifyEmailAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface LinkOption {
  value: string;
  label: string;
}

/**
 * The update panel for one inquiry: the office note, the follow-up date, and
 * the four things that can happen to a lead.
 *
 * It is collapsed until asked for, because the list is read far more often than
 * it is edited and a page of open forms is unreadable.
 */
export function InquiryActions({
  inquiryId,
  name,
  status,
  note,
  followUp,
  links,
  labels,
}: {
  inquiryId: number;
  name: string;
  status: string;
  note: string;
  followUp: string;
  links: LinkOption[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(inquiryAction, EMPTY);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (state.message !== '') return <Alert tone="success">{state.message}</Alert>;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={SMALL}>
        <i className="bi bi-pencil-square me-1" aria-hidden /> {labels.manage}
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3 rounded-orbit border border-line-soft p-3">
      <input type="hidden" name="id" value={inquiryId} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

      <p className="text-xs font-semibold text-ink-heading">
        {labels.title.replace('{name}', name)}
      </p>

      <label className="block text-xs font-medium text-ink">
        {labels.note}
        <textarea
          name="admin_note"
          rows={2}
          maxLength={2000}
          defaultValue={note}
          placeholder={labels.notePlaceholder}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.followUp}
          <input
            type="date"
            name="follow_up_date"
            defaultValue={followUp}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.followUpHint}
          </span>
        </label>

        {links.length > 0 && (
          <label className="block text-xs font-medium text-ink">
            {labels.link}
            <select name="link" defaultValue="" className={`mt-1 ${CONTROL}`}>
              <option value="">{labels.linkNone}</option>
              {links.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {status !== 'called' && (
          <button
            type="submit"
            name="act"
            value="called"
            disabled={pending}
            className="rounded-orbit bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            <i className="bi bi-telephone-outbound me-1" aria-hidden /> {labels.called}
          </button>
        )}

        {status !== 'admitted' && (
          <button
            type="submit"
            name="act"
            value="admitted"
            disabled={pending}
            className="rounded-orbit bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            <i className="bi bi-check2-circle me-1" aria-hidden /> {labels.admitted}
          </button>
        )}

        {status !== 'not_interested' && (
          <button type="submit" name="act" value="not_interested" disabled={pending} className={SMALL}>
            {labels.notInterested}
          </button>
        )}

        {status !== 'new' && (
          <button type="submit" name="act" value="reopen" disabled={pending} className={SMALL}>
            {labels.reopen}
          </button>
        )}

        <button type="submit" name="act" value="note" disabled={pending} className={SMALL}>
          {labels.noteOnly}
        </button>

        {confirming ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">{labels.deleteConfirm}</span>
            <button
              type="submit"
              name="act"
              value="delete"
              disabled={pending}
              className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
            >
              {labels.remove}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={SMALL}>
              {labels.cancel}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${SMALL} text-red-600`}
          >
            <i className="bi bi-trash" aria-hidden />
          </button>
        )}

        <button type="button" onClick={() => setOpen(false)} className={`${SMALL} ms-auto`}>
          {labels.close}
        </button>
      </div>
    </form>
  );
}

/** Where new inquiries are emailed. */
export function NotifyEmailForm({
  email,
  labels,
}: {
  email: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveNotifyEmailAction, EMPTY);

  return (
    <form action={action} className="space-y-3" id="inq-settings">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 text-xs font-medium text-ink">
          {labels.label}
          <input
            type="email"
            name="inquiry_notify_email"
            maxLength={190}
            defaultValue={email}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.hint}</span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
      </div>
    </form>
  );
}
