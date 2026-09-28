'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import {
  collectAction,
  generateAction,
  createPlanAction,
  cancelPlanAction,
  saveDiscountAction,
  toggleDiscountAction,
  deleteDiscountAction,
  saveFeeSettingsAction,
} from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

/**
 * Recording money against one charge.
 *
 * The amount is pre-filled with what is due, because paying in full is the common
 * case; a smaller number is a part payment and the form says so rather than
 * making the admin wonder whether it is allowed.
 */
export function CollectForm({
  paymentId,
  studentId,
  due,
  methods,
  labels,
}: {
  paymentId: number;
  studentId: number;
  due: string;
  methods: { value: string; label: string }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(collectAction, EMPTY);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {state.message !== '' && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">{state.message}</span>
        )}
        <button type="button" onClick={() => setOpen(true)} className={SMALL}>
          {labels.collect}
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      id="collect"
      className="w-full space-y-3 rounded-orbit border border-line bg-surface-2/50 p-3"
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="student_id" value={studentId} />

      <p className="text-sm font-semibold text-ink-heading">{labels.collectTitle}</p>

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-xs font-medium text-ink">
          {labels.amount} *
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={due}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.amountHelp}
          </span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.method} *
          <select name="payment_method" required className={`mt-1 ${CONTROL}`}>
            {methods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.transaction}
          <input name="transaction_id" maxLength={100} className={`mt-1 ${CONTROL}`} />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.notes}
          <input name="notes" maxLength={1000} className={`mt-1 ${CONTROL}`} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={SMALL}>
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}

/** The confirm half of the monthly generation: tick who to charge. */
export function GenerateConfirmForm({
  month,
  dueDate,
  amount,
  courseId,
  batchId,
  rows,
  labels,
}: {
  month: string;
  dueDate: string;
  amount: string;
  courseId: number;
  batchId: number;
  rows: {
    studentId: number;
    name: string;
    studentIdNo: string;
    placement: string;
    base: string;
    discount: string;
    final: string;
    status: string;
    statusLabel: string;
    creatable: boolean;
  }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(generateAction, EMPTY);

  const creatable = rows.filter((row) => row.creatable);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="due_date" value={dueDate} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="course" value={courseId} />
      <input type="hidden" name="batch" value={batchId} />

      {state.error !== '' && <Alert tone="warning">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-start text-xs text-ink-muted">
              <th className="px-2 py-2 text-start">{labels.select}</th>
              <th className="px-2 py-2 text-start">{labels.student}</th>
              <th className="px-2 py-2 text-end">{labels.fee}</th>
              <th className="px-2 py-2 text-end">{labels.discount}</th>
              <th className="px-2 py-2 text-end">{labels.final}</th>
              <th className="px-2 py-2 text-start">{labels.status}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.studentId} className="border-b border-line-soft">
                <td className="px-2 py-2">
                  {/* Only the rows that would actually create a charge can be
                      ticked; the rest are shown so the admin knows why not. */}
                  {row.creatable && (
                    <input
                      type="checkbox"
                      name="students"
                      value={row.studentId}
                      defaultChecked
                      className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                    />
                  )}
                </td>
                <td className="px-2 py-2">
                  <span className="font-medium text-ink">{row.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {[row.studentIdNo, row.placement].filter((part) => part !== '').join(' · ')}
                  </span>
                </td>
                <td className="px-2 py-2 text-end">{row.base}</td>
                <td className="px-2 py-2 text-end">{row.discount}</td>
                <td className="px-2 py-2 text-end font-semibold">{row.final}</td>
                <td className="px-2 py-2 text-xs text-ink-muted">{row.statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-muted">{labels.idempotent}</p>

      <button
        type="submit"
        disabled={pending || creatable.length === 0}
        className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {labels.create}
      </button>
    </form>
  );
}

/** A new instalment plan, with the schedule previewed as it is typed. */
export function PlanForm({
  students,
  labels,
}: {
  students: { id: number; label: string }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(createPlanAction, EMPTY);
  const [total, setTotal] = useState('');
  const [count, setCount] = useState('3');
  const [firstDue, setFirstDue] = useState('');
  const [interval, setInterval] = useState('1');

  // The same arithmetic the server uses: whole taka each, the last one carries
  // the remainder. Shown here so nobody is surprised by the split.
  const schedule = (() => {
    const amount = Number(total);
    const parts = Number(count);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(parts) || parts < 2) return [];

    let each = Math.floor(amount / parts);
    if (each <= 0) each = Math.round((amount / parts) * 100) / 100;

    return Array.from({ length: parts }, (_, index) => ({
      no: index + 1,
      amount:
        index + 1 < parts ? each : Math.round((amount - each * (parts - 1)) * 100) / 100,
    }));
  })();

  return (
    <form action={action} id="planForm" className="space-y-3">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.student} *
          <select name="student_id" required className={`mt-1 ${CONTROL}`}>
            <option value="">—</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.title} *
          <input
            name="title"
            required
            maxLength={150}
            placeholder={labels.titlePlaceholder}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-xs font-medium text-ink">
          {labels.total} *
          <input
            name="total"
            required
            inputMode="decimal"
            value={total}
            onChange={(event) => setTotal(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.count} *
          <input
            name="count"
            type="number"
            min={2}
            max={24}
            required
            value={count}
            onChange={(event) => setCount(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.firstDue} *
          <input
            name="first_due"
            type="date"
            required
            value={firstDue}
            onChange={(event) => setFirstDue(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.interval} *
          <input
            name="interval"
            type="number"
            min={1}
            max={12}
            required
            value={interval}
            onChange={(event) => setInterval(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-ink">
        {labels.note}
        <input name="note" maxLength={1000} className={`mt-1 ${CONTROL}`} />
      </label>

      {schedule.length > 0 && (
        <div className="rounded-orbit border border-line-soft bg-surface-2/50 p-3 text-xs">
          <p className="font-semibold text-ink">{labels.preview}</p>
          <ul className="mt-1 flex flex-wrap gap-3">
            {schedule.map((row) => (
              <li key={row.no} className="text-ink-muted">
                {row.no}. <span className="font-medium text-ink">{row.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {labels.create}
      </button>
    </form>
  );
}

/** Cancelling the unpaid remainder of a plan. */
export function CancelPlanButton({
  planId,
  planTitle,
  labels,
}: {
  planId: number;
  planTitle: string;
  labels: { cancel: string; confirm: string; dismiss: string };
}) {
  const [state, action, pending] = useActionState(cancelPlanAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {state.message !== '' && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">{state.message}</span>
        )}
        {state.error !== '' && <span className="text-xs text-red-600">{state.error}</span>}
        <button type="button" onClick={() => setAsking(true)} className={SMALL}>
          {labels.cancel}
        </button>
      </span>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="plan_id" value={planId} />
      <span className="text-xs text-ink">{labels.confirm.replace('{title}', planTitle)}</span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
      >
        {labels.cancel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={SMALL}>
        {labels.dismiss}
      </button>
    </form>
  );
}

/** A per-student discount. */
export function DiscountForm({
  values,
  students,
  labels,
}: {
  values: {
    id: number;
    studentId: number;
    type: string;
    value: string;
    appliesTo: string;
    reason: string;
    startsOn: string;
    endsOn: string;
    isActive: boolean;
  };
  students: { id: number; label: string }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveDiscountAction, EMPTY);

  return (
    <form action={action} id="discountForm" className="space-y-3">
      <input type="hidden" name="id" value={values.id} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.student} *
          <select
            name="student_id"
            required
            defaultValue={values.studentId > 0 ? String(values.studentId) : ''}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="">—</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.reason}
          <input
            name="reason"
            maxLength={255}
            placeholder={labels.reasonPlaceholder}
            defaultValue={values.reason}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-xs font-medium text-ink">
          {labels.type}
          <select name="discount_type" defaultValue={values.type} className={`mt-1 ${CONTROL}`}>
            <option value="fixed">{labels.typeFixed}</option>
            <option value="percent">{labels.typePercent}</option>
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.value} *
          <input
            name="value"
            required
            inputMode="decimal"
            defaultValue={values.value}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.appliesTo}
          <select name="applies_to" defaultValue={values.appliesTo} className={`mt-1 ${CONTROL}`}>
            <option value="monthly">{labels.appliesMonthly}</option>
            <option value="all">{labels.appliesAll}</option>
          </select>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.from}
          <input
            name="starts_on"
            type="date"
            defaultValue={values.startsOn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.to}
          <input
            name="ends_on"
            type="date"
            defaultValue={values.endsOn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <p className="text-[11px] text-ink-muted">{labels.hint}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        {values.id > 0 && (
          <Link href="/admin/fees?tab=discounts" className={SMALL}>
            {labels.cancel}
          </Link>
        )}
      </div>
    </form>
  );
}

/** Activate / deactivate and delete, on one discount. */
export function DiscountRowActions({
  discountId,
  isActive,
  editHref,
  labels,
}: {
  discountId: number;
  isActive: boolean;
  editHref: string;
  labels: Record<string, string>;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleDiscountAction, EMPTY);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteDiscountAction, EMPTY);
  const [asking, setAsking] = useState(false);

  const error = toggleState.error || deleteState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error !== '' && <span className="w-full text-end text-xs text-red-600">{error}</span>}

      <Link href={editHref} className={SMALL}>
        {labels.edit}
      </Link>

      <form action={toggleAction} className="inline">
        <input type="hidden" name="id" value={discountId} />
        <button type="submit" disabled={togglePending} className={SMALL}>
          {isActive ? labels.deactivate : labels.activate}
        </button>
      </form>

      {asking ? (
        <form action={deleteAction} className="inline-flex items-center gap-2">
          <input type="hidden" name="id" value={discountId} />
          <span className="text-xs text-ink">{labels.confirmDelete}</span>
          <button
            type="submit"
            disabled={deletePending}
            className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
          >
            {labels.remove}
          </button>
          <button type="button" onClick={() => setAsking(false)} className={SMALL}>
            {labels.dismiss}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          {labels.remove}
        </button>
      )}
    </div>
  );
}

/** The two fee settings. */
export function FeeSettingsForm({
  gapDays,
  dueDay,
  labels,
}: {
  gapDays: number;
  dueDay: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveFeeSettingsAction, EMPTY);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <label className="block text-xs font-medium text-ink">
        {labels.gap}
        <input
          name="gap_days"
          type="number"
          min={0}
          max={60}
          defaultValue={gapDays}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.dueDay}
        <input
          name="due_day"
          type="number"
          min={1}
          max={28}
          defaultValue={dueDay}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {labels.save}
      </button>
    </form>
  );
}
