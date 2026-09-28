'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { approveApplicationAction, rejectApplicationAction, setApplicationStatusAction, saveApplicationNoteAction, deleteApplicationAction, type ApplicationState } from './actions';
import { emptyApplicationState } from './state';

const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';
const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

/**
 * Everything an admin can do to one application.
 *
 * Approve and reject each open a panel rather than firing on one click, because
 * both are irreversible in practice: approving creates a student, an enrolment, a
 * verified payment and a login, and rejecting emails the applicant.
 *
 * The approve panel's tick-box is the record that a human compared the claim with
 * the bKash/Nagad statement. The server refuses without it.
 */
export function ApplicationActions({
  applicationId,
  applicantName,
  status,
  note,
  canDelete,
  labels,
}: {
  applicationId: number;
  applicantName: string;
  status: string;
  note: string;
  canDelete: boolean;
  labels: Record<string, string>;
}) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveApplicationAction,
    emptyApplicationState
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectApplicationAction,
    emptyApplicationState
  );
  const [statusState, statusAction, statusPending] = useActionState(
    setApplicationStatusAction,
    emptyApplicationState
  );
  const [noteState, noteAction, notePending] = useActionState(
    saveApplicationNoteAction,
    emptyApplicationState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteApplicationAction,
    emptyApplicationState
  );

  const [panel, setPanel] = useState<'' | 'approve' | 'reject' | 'note' | 'delete'>('');

  const states: ApplicationState[] = [approveState, rejectState, statusState, noteState, deleteState];
  const error = states.find((state) => state.error !== '')?.error ?? '';
  const done = states.find((state) => state.message !== '') ?? null;

  // The credentials of a login created a moment ago, shown once and never again.
  const credentials = approveState.credentials;

  return (
    <div className="space-y-3">
      {error !== '' && <Alert tone="danger">{error}</Alert>}

      {done && (
        <Alert tone="success">
          {done.message}
          {done.notes.length > 0 && (
            <span className="mt-1 block text-xs">{done.notes.join(' ')}</span>
          )}
        </Alert>
      )}

      {credentials && (
        <div className="rounded-orbit border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            {credentials.isNew ? labels.credTitle : labels.credTitleExisting}
          </p>
          <dl className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">{labels.studentIdGiven}</dt>
              <dd className="font-mono">{credentials.studentId}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{labels.credUsername}</dt>
              <dd className="font-mono">{credentials.username}</dd>
            </div>
            {credentials.password !== '' && (
              <div>
                <dt className="text-xs text-ink-muted">{labels.credPassword}</dt>
                <dd className="font-mono text-base font-bold">{credentials.password}</dd>
              </div>
            )}
          </dl>
          {credentials.password !== '' && (
            <p className="mt-2 text-xs text-ink-muted">{labels.credText}</p>
          )}
          <Link
            href={`/admin/students/${credentials.studentPk}`}
            className="mt-3 inline-block rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2"
          >
            {labels.viewStudent}
          </Link>
        </div>
      )}

      {panel === 'approve' && (
        <form action={approveAction} className="space-y-3 rounded-orbit border border-line bg-surface-2/50 p-3">
          <input type="hidden" name="application_id" value={applicationId} />
          <p className="text-sm font-semibold text-ink-heading">{labels.approveTitle}</p>
          <p className="text-sm text-ink">{labels.approveText.replace('{name}', applicantName)}</p>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="confirm_checked"
              value="1"
              required
              className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span>{labels.approveCheck}</span>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.note}
            <input name="note" maxLength={1000} placeholder={labels.notePlaceholder} className={`mt-1 ${CONTROL}`} />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="send_email"
              value="1"
              defaultChecked
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span>{labels.sendEmail}</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={approvePending}
              className="rounded-orbit bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {labels.approve}
            </button>
            <button type="button" onClick={() => setPanel('')} className={SMALL}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      {panel === 'reject' && (
        <form action={rejectAction} className="space-y-3 rounded-orbit border border-line bg-surface-2/50 p-3">
          <input type="hidden" name="application_id" value={applicationId} />
          <p className="text-sm font-semibold text-ink-heading">{labels.rejectTitle}</p>

          <label className="block text-xs font-medium text-ink">
            {labels.rejectReason} *
            <textarea
              name="reason"
              required
              maxLength={1000}
              rows={2}
              placeholder={labels.rejectReasonPlaceholder}
              className={`mt-1 ${CONTROL}`}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="payment_problem"
              value="1"
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span>{labels.rejectPayment}</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="send_email"
              value="1"
              defaultChecked
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span>{labels.sendEmail}</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={rejectPending}
              className="rounded-orbit bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {labels.reject}
            </button>
            <button type="button" onClick={() => setPanel('')} className={SMALL}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      {panel === 'note' && (
        <form action={noteAction} className="space-y-2 rounded-orbit border border-line bg-surface-2/50 p-3">
          <input type="hidden" name="application_id" value={applicationId} />
          <label className="block text-xs font-medium text-ink">
            {labels.note}
            <textarea
              name="note"
              maxLength={1000}
              rows={2}
              defaultValue={note}
              placeholder={labels.notePlaceholder}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={notePending}
              className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
            >
              {labels.saveNote}
            </button>
            <button type="button" onClick={() => setPanel('')} className={SMALL}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      {panel === 'delete' && (
        <form action={deleteAction} className="flex flex-wrap items-center gap-2 rounded-orbit border border-red-300 bg-red-50 p-3 dark:bg-red-950/30">
          <input type="hidden" name="application_id" value={applicationId} />
          <span className="text-sm text-ink">{labels.confirmDelete}</span>
          <button
            type="submit"
            disabled={deletePending}
            className="rounded-orbit bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
          >
            {labels.delete}
          </button>
          <button type="button" onClick={() => setPanel('')} className={SMALL}>
            {labels.cancel}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {status !== 'approved' && (
          <>
            <button
              type="button"
              onClick={() => setPanel(panel === 'approve' ? '' : 'approve')}
              className="rounded-orbit bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
            >
              {labels.approve}
            </button>
            <button
              type="button"
              onClick={() => setPanel(panel === 'reject' ? '' : 'reject')}
              className="rounded-orbit border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              {labels.reject}
            </button>

            {/* The two intermediate states: "we are looking at it" and "the
                money is confirmed but the paperwork is not done". */}
            {status !== 'under_review' && (
              <form action={statusAction} className="inline">
                <input type="hidden" name="application_id" value={applicationId} />
                <input type="hidden" name="status" value="under_review" />
                <button type="submit" disabled={statusPending} className={SMALL}>
                  {labels.markReview}
                </button>
              </form>
            )}
            {status !== 'payment_verified' && (
              <form action={statusAction} className="inline">
                <input type="hidden" name="application_id" value={applicationId} />
                <input type="hidden" name="status" value="payment_verified" />
                <button type="submit" disabled={statusPending} className={SMALL}>
                  {labels.markVerified}
                </button>
              </form>
            )}
            {status !== 'pending' && (
              <form action={statusAction} className="inline">
                <input type="hidden" name="application_id" value={applicationId} />
                <input type="hidden" name="status" value="pending" />
                <button type="submit" disabled={statusPending} className={SMALL}>
                  {labels.markPending}
                </button>
              </form>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => setPanel(panel === 'note' ? '' : 'note')}
          className={SMALL}
        >
          {labels.note}
        </button>

        {canDelete && (
          <button
            type="button"
            onClick={() => setPanel(panel === 'delete' ? '' : 'delete')}
            className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            {labels.delete}
          </button>
        )}
      </div>
    </div>
  );
}
