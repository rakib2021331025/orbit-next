'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import {
  createFromPhoneAction,
  createManualAction,
  linkStudentAction,
  unlinkStudentAction,
  updateGuardianAction,
  resetPasswordAction,
  toggleGuardianAction,
  deleteGuardianAction,
} from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '', password: '', phone: '', guardianId: 0 };

/**
 * The temporary password, shown once.
 *
 * It is stored only as a hash, so this panel is the single moment anybody can
 * read it — hence the WhatsApp link, which is how these are actually delivered.
 */
function CredentialsPanel({
  password,
  phone,
  whatsappMessage,
  labels,
}: {
  password: string;
  phone: string;
  whatsappMessage: string;
  labels: Record<string, string>;
}) {
  if (password === '') return null;

  const message = whatsappMessage
    .replace('{phone}', phone)
    .replace('{password}', password);
  const digits = phone.replace(/\D+/g, '');

  return (
    <div className="rounded-orbit border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
      <p className="font-semibold text-emerald-900 dark:text-emerald-200">{labels.credTitle}</p>
      <dl className="mt-2 grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-muted">{labels.phone}</dt>
          <dd className="font-mono">{phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{labels.tempPassword}</dt>
          <dd className="font-mono text-base font-bold">{password}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-muted">{labels.credOnce}</p>
      {digits !== '' && (
        <a
          href={`https://wa.me/88${digits}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-orbit bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
        >
          {labels.shareWhatsapp}
        </a>
      )}
    </div>
  );
}

/** One row of the "students without a guardian login" list. */
export function UnlinkedGroupActions({
  phone,
  guardianId,
  count,
  whatsappMessage,
  labels,
}: {
  phone: string;
  guardianId: number | null;
  count: number;
  whatsappMessage: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(createFromPhoneAction, EMPTY);

  return (
    <div className="space-y-2">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}
      <CredentialsPanel
        password={state.password}
        phone={state.phone}
        whatsappMessage={whatsappMessage}
        labels={labels}
      />

      <form action={action} className="flex flex-wrap items-center justify-end gap-2">
        <input type="hidden" name="phone" value={phone} />
        {guardianId !== null && (
          <span className="text-xs text-ink-muted">{labels.hasAccount}</span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {(guardianId !== null ? labels.linkExisting : labels.createLogin).replace(
            '{count}',
            String(count)
          )}
        </button>
      </form>
    </div>
  );
}

/** Creating an account by hand, for a number no student record carries. */
export function ManualCreateForm({
  whatsappMessage,
  labels,
}: {
  whatsappMessage: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(createManualAction, EMPTY);

  return (
    <form action={action} className="space-y-3">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}
      <CredentialsPanel
        password={state.password}
        phone={state.phone}
        whatsappMessage={whatsappMessage}
        labels={labels}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.phone} *
          <input name="phone" required placeholder="01XXXXXXXXX" className={`mt-1 ${CONTROL}`} />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.name}
          <input name="name" maxLength={255} className={`mt-1 ${CONTROL}`} />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.email}
          <input name="email" type="email" maxLength={255} className={`mt-1 ${CONTROL}`} />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.studentRef}
          <input name="student_ref" className={`mt-1 ${CONTROL}`} />
        </label>
      </div>

      <p className="text-[11px] text-ink-muted">{labels.createHint}</p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {labels.createSubmit}
      </button>
    </form>
  );
}

/** Everything that can be done to one existing guardian account. */
export function GuardianRowActions({
  guardianId,
  phone,
  name,
  email,
  status,
  whatsappMessage,
  labels,
}: {
  guardianId: number;
  phone: string;
  name: string;
  email: string;
  status: string;
  whatsappMessage: string;
  labels: Record<string, string>;
}) {
  const [updateState, updateAction, updatePending] = useActionState(updateGuardianAction, EMPTY);
  const [resetState, resetAction, resetPending] = useActionState(resetPasswordAction, EMPTY);
  const [toggleState, toggleAction, togglePending] = useActionState(toggleGuardianAction, EMPTY);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteGuardianAction, EMPTY);
  const [panel, setPanel] = useState<'' | 'edit' | 'reset' | 'delete'>('');

  const error = updateState.error || resetState.error || toggleState.error || deleteState.error;
  const done = [updateState, resetState, toggleState, deleteState].find(
    (state) => state.message !== ''
  );

  return (
    <div className="space-y-2">
      {error !== '' && <span className="block text-end text-xs text-red-600">{error}</span>}
      {done && (
        <span className="block text-end text-xs text-emerald-700 dark:text-emerald-400">
          {done.message}
        </span>
      )}
      <CredentialsPanel
        password={resetState.password}
        phone={resetState.phone}
        whatsappMessage={whatsappMessage}
        labels={labels}
      />

      {panel === 'edit' && (
        <form
          action={updateAction}
          className="space-y-2 rounded-orbit border border-line bg-surface-2/50 p-3 text-start"
        >
          <input type="hidden" name="guardian_id" value={guardianId} />
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="phone" defaultValue={phone} className={CONTROL} />
            <input name="name" defaultValue={name} placeholder={labels.name} className={CONTROL} />
            <input
              name="email"
              type="email"
              defaultValue={email}
              placeholder={labels.email}
              className={CONTROL}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={updatePending}
              className="rounded-orbit bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover"
            >
              {labels.save}
            </button>
            <button type="button" onClick={() => setPanel('')} className={SMALL}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      {panel === 'reset' && (
        <form action={resetAction} className="flex flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="guardian_id" value={guardianId} />
          <span className="text-xs text-ink">{labels.resetConfirm}</span>
          <button
            type="submit"
            disabled={resetPending}
            className="rounded-orbit bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary-hover"
          >
            {labels.resetPassword}
          </button>
          <button type="button" onClick={() => setPanel('')} className={SMALL}>
            {labels.cancel}
          </button>
        </form>
      )}

      {panel === 'delete' && (
        <form action={deleteAction} className="flex flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="guardian_id" value={guardianId} />
          <span className="text-xs text-ink">{labels.deleteConfirm}</span>
          <button
            type="submit"
            disabled={deletePending}
            className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
          >
            {labels.remove}
          </button>
          <button type="button" onClick={() => setPanel('')} className={SMALL}>
            {labels.cancel}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button type="button" onClick={() => setPanel(panel === 'edit' ? '' : 'edit')} className={SMALL}>
          {labels.edit}
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === 'reset' ? '' : 'reset')}
          className={SMALL}
        >
          {labels.resetPassword}
        </button>

        <form action={toggleAction} className="inline">
          <input type="hidden" name="guardian_id" value={guardianId} />
          <button type="submit" disabled={togglePending} className={SMALL}>
            {status === 'active' ? labels.deactivate : labels.activate}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setPanel(panel === 'delete' ? '' : 'delete')}
          className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          {labels.remove}
        </button>
      </div>
    </div>
  );
}

/** Linking or unlinking one child. */
export function ChildActions({
  guardianId,
  studentId,
  studentName,
  labels,
}: {
  guardianId: number;
  studentId: number;
  studentName: string;
  labels: { unlink: string; confirm: string; dismiss: string; profile: string };
}) {
  const [state, action, pending] = useActionState(unlinkStudentAction, EMPTY);
  const [asking, setAsking] = useState(false);

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {state.error !== '' && <span className="text-xs text-red-600">{state.error}</span>}

      <Link href={`/admin/students/${studentId}`} className={SMALL}>
        {labels.profile}
      </Link>

      {asking ? (
        <form action={action} className="inline-flex items-center gap-1.5">
          <input type="hidden" name="guardian_id" value={guardianId} />
          <input type="hidden" name="student_id" value={studentId} />
          <span className="text-xs text-ink">{labels.confirm}</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-orbit bg-red-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-red-700"
          >
            {labels.unlink}
          </button>
          <button type="button" onClick={() => setAsking(false)} className={SMALL}>
            {labels.dismiss}
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={SMALL}>
          {labels.unlink}
        </button>
      )}
      <span className="sr-only">{studentName}</span>
    </span>
  );
}

/** Adding another child to an account, by Student ID. */
export function LinkChildForm({
  guardianId,
  students,
  labels,
}: {
  guardianId: number;
  students: { id: number; label: string }[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(linkStudentAction, EMPTY);

  if (students.length === 0) {
    return <p className="text-xs text-ink-muted">{labels.linkNone}</p>;
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="guardian_id" value={guardianId} />

      {state.error !== '' && <span className="w-full text-xs text-red-600">{state.error}</span>}

      <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-ink">
        {labels.linkTitle}
        <select name="student_id" className={CONTROL}>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-ink">
        {labels.relation}
        <select name="relation" className={CONTROL}>
          <option value="">{labels.relationAuto}</option>
          <option value="father">{labels.father}</option>
          <option value="mother">{labels.mother}</option>
          <option value="guardian">{labels.guardian}</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-orbit bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
      >
        {labels.link}
      </button>
    </form>
  );
}
