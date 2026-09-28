'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { savePaymentAction, deletePaymentAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface PaymentValues {
  id: number;
  studentId: number;
  studentLabel: string;
  amount: string;
  dueAmount: string;
  month: string;
  method: string;
  notes: string;
  dueDate: string;
}

/**
 * Recording a payment, or correcting one already recorded.
 *
 * The student is a dropdown when adding and a read-only line when editing: a
 * payment moved to another student would carry its receipt number with it, and
 * a receipt already in somebody's hand must keep meaning what it says.
 */
export function PaymentForm({
  values,
  students,
  methods,
  canEditDueDate,
  labels,
  cancelHref,
}: {
  values: PaymentValues;
  students: { id: number; label: string }[];
  methods: { value: string; label: string }[];
  canEditDueDate: boolean;
  labels: Record<string, string>;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState(savePaymentAction, EMPTY);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="payment_id" value={values.id} />
      {editing && <input type="hidden" name="student_id" value={values.studentId} />}

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <label className="block text-xs font-medium text-ink">
        {labels.student} *
        {editing ? (
          <>
            <input readOnly value={values.studentLabel} className={`mt-1 ${CONTROL}`} />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.studentFixed}
            </span>
          </>
        ) : (
          <select name="student_id" required defaultValue="" className={`mt-1 ${CONTROL}`}>
            <option value="">{labels.selectStudent}</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.label}
              </option>
            ))}
          </select>
        )}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.amount} *
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max="99999999"
            required
            defaultValue={values.amount}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.due}
          <input
            name="due_amount"
            type="number"
            step="1"
            min="0"
            defaultValue={values.dueAmount}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>
      <p className="text-[11px] text-ink-muted">{labels.dueHelp}</p>

      <label className="block text-xs font-medium text-ink">
        {labels.month} *
        <input
          name="payment_month"
          required
          maxLength={20}
          placeholder={labels.monthPlaceholder}
          defaultValue={values.month}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      {editing && canEditDueDate && (
        <label className="block text-xs font-medium text-ink">
          {labels.dueDate}
          <input
            name="due_date"
            type="date"
            defaultValue={values.dueDate}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      )}

      <label className="block text-xs font-medium text-ink">
        {labels.method}
        <select name="payment_method" defaultValue={values.method} className={`mt-1 ${CONTROL}`}>
          {methods.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.notes}
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={values.notes}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? labels.saving : editing ? labels.saveEdit : labels.add}
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

/** Deleting one payment, behind a confirmation that names it. */
export function DeletePayment({
  paymentId,
  studentId,
  labels,
}: {
  paymentId: number;
  studentId: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deletePaymentAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.error !== '') {
    return <span className="text-xs text-red-600">{state.error}</span>;
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
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="student_id" value={studentId} />
      <span className="text-xs text-ink-muted">{labels.confirm}</span>
      <button
        type="submit"
        disabled={pending}
        className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
      >
        {labels.remove}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={SMALL}>
        {labels.dismiss}
      </button>
    </form>
  );
}
