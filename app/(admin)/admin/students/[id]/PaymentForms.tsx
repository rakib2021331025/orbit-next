'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { addPaymentAction, markPaidAction } from './actions';
import { emptyPaymentState } from './state';
import { createFromPhoneAction } from '../../guardians/actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

/**
 * Recording a payment against this student.
 *
 * Status is part of the form because an office records both kinds of thing here:
 * money that just arrived, and a charge that is owed and will be collected
 * later. An unpaid monthly charge automatically takes the institute's default
 * due date, which is what later makes it appear as overdue.
 */
export function AddPaymentForm({
  studentId,
  methods,
  labels,
}: {
  studentId: number;
  methods: { value: string; label: string }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(addPaymentAction, emptyPaymentState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="student_id" value={studentId} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs font-medium text-ink">
          {labels.amount} *
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.month} *
          <input
            name="month"
            required
            maxLength={20}
            placeholder={labels.monthPlaceholder}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.method}
          <select name="payment_method" className={`mt-1 ${CONTROL}`}>
            {methods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select name="status" defaultValue="paid" className={`mt-1 ${CONTROL}`}>
            <option value="paid">{labels.statusPaid}</option>
            <option value="unpaid">{labels.statusUnpaid}</option>
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.due}
          <input
            name="due_amount"
            type="number"
            step="1"
            min="0"
            defaultValue="0"
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.notes}
          <input
            name="notes"
            maxLength={500}
            placeholder={labels.optional}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        <span className="text-xs text-ink-muted">{labels.partialHint}</span>
      </div>
    </form>
  );
}

/**
 * Settling one charge: collect part of it, mark the whole thing paid, or
 * download the receipt.
 *
 * There is deliberately **no delete here**. The original offers deletion only on
 * Payment Tracking, and a charge on a student's own page is history an admin
 * reads rather than a row they tidy up.
 */
export function ChargeActions({
  studentId,
  paymentId,
  state,
  collectHref,
  labels,
}: {
  studentId: number;
  paymentId: number;
  state: 'paid' | 'partial' | 'unpaid';
  collectHref: string;
  labels: {
    collect: string;
    markPaid: string;
    receipt: string;
  };
}) {
  const [markState, markAction, markPending] = useActionState(markPaidAction, emptyPaymentState);
  const error = markState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      {state !== 'paid' && (
        <>
          {/* Part payment goes through the fee screen, which records how much
              arrived; "mark paid" settles the whole charge at once. */}
          <a href={collectHref} className={SMALL}>
            {labels.collect}
          </a>
          <form action={markAction} className="inline">
            <input type="hidden" name="student_id" value={studentId} />
            <input type="hidden" name="payment_id" value={paymentId} />
            <button
              type="submit"
              disabled={markPending}
              className="rounded-orbit border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            >
              {labels.markPaid}
            </button>
          </form>
        </>
      )}

      {state !== 'unpaid' && (
        <a
          href={`/api/receipt/${paymentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={SMALL}
          title={labels.receipt}
        >
          <i className="bi bi-download" aria-hidden />
        </a>
      )}

    </div>
  );
}

/**
 * Creating a guardian login straight from a student's profile.
 *
 * The original offers this here because it is where the need arises: an admin
 * looking at a student sees there is no parent login and makes one from the
 * guardian phone already on the record. Every sibling carrying that number is
 * linked at the same time.
 */
export function CreateGuardianButton({
  phone,
  labels,
}: {
  phone: string;
  labels: { create: string };
}) {
  const [state, action, pending] = useActionState(createFromPhoneAction, {
    error: '',
    message: '',
    password: '',
    phone: '',
    guardianId: 0,
  });

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="phone" value={phone} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      {/* The temporary password is shown once, on the guardians screen. */}
      {state.password !== '' && (
        <p className="font-mono text-sm font-bold text-ink">{state.password}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60"
      >
        {labels.create}
      </button>
    </form>
  );
}
