'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { createLoginAction, resetLoginPasswordAction, deleteLoginAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

/**
 * Creating a login for a student who has none.
 *
 * Choosing the student fills the username with their Student ID, because that is
 * what the student already knows and what is printed on their card — and it is
 * also what the server falls back to if the field is left empty.
 */
export function CreateLoginForm({
  students,
  preselect,
  labels,
}: {
  students: { id: number; label: string; studentId: string }[];
  preselect: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(createLoginAction, EMPTY);
  const [studentId, setStudentId] = useState(preselect > 0 ? String(preselect) : '');
  const [username, setUsername] = useState(
    students.find((student) => student.id === preselect)?.studentId ?? ''
  );

  if (students.length === 0) {
    return <p className="text-sm text-ink-muted">{labels.noneWithout}</p>;
  }

  return (
    <form action={action} id="loginForm" className="space-y-3">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-ink">
          {labels.selectStudent} *
          <select
            name="student_id"
            required
            value={studentId}
            onChange={(event) => {
              setStudentId(event.currentTarget.value);
              const chosen = students.find(
                (student) => String(student.id) === event.currentTarget.value
              );
              setUsername(chosen?.studentId ?? '');
            }}
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
          {labels.username}
          <input
            name="username"
            maxLength={100}
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.usernameHelp}
          </span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.password} *
          <input
            name="password"
            type="text"
            required
            autoComplete="new-password"
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

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

/** Reset and delete, on one existing login. */
export function LoginRowActions({
  loginId,
  studentName,
  username,
  labels,
}: {
  loginId: number;
  studentName: string;
  username: string;
  labels: Record<string, string>;
}) {
  const [resetState, resetAction, resetPending] = useActionState(resetLoginPasswordAction, EMPTY);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteLoginAction, EMPTY);
  const [panel, setPanel] = useState<'' | 'reset' | 'delete'>('');

  const error = resetState.error || deleteState.error;
  const done = resetState.message || deleteState.message;

  return (
    <div className="space-y-2">
      {error !== '' && <span className="block text-end text-xs text-red-600">{error}</span>}
      {done !== '' && (
        <span className="block text-end text-xs text-emerald-700 dark:text-emerald-400">{done}</span>
      )}

      {panel === 'reset' && (
        <form
          action={resetAction}
          className="space-y-2 rounded-orbit border border-line bg-surface-2/50 p-3 text-start"
        >
          <input type="hidden" name="login_id" value={loginId} />
          <p className="text-sm font-semibold text-ink-heading">
            {labels.resetFor.replace('{name}', studentName).replace('{username}', username)}
          </p>
          <input
            name="new_password"
            type="text"
            required
            autoComplete="new-password"
            className={CONTROL}
          />
          <p className="text-[11px] text-ink-muted">{labels.resetNote}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={resetPending}
              className="rounded-orbit bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover"
            >
              {labels.reset}
            </button>
            <button type="button" onClick={() => setPanel('')} className={SMALL}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      {panel === 'delete' && (
        <form action={deleteAction} className="flex flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="login_id" value={loginId} />
          <span className="text-xs text-ink">
            {labels.deleteConfirm.replace('{name}', studentName).replace('{username}', username)}
          </span>
          <button
            type="submit"
            disabled={deletePending}
            className="rounded-orbit bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700"
          >
            {labels.delete}
          </button>
          <button type="button" onClick={() => setPanel('')} className={SMALL}>
            {labels.cancel}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setPanel(panel === 'reset' ? '' : 'reset')}
          className={SMALL}
        >
          {labels.reset}
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === 'delete' ? '' : 'delete')}
          className="rounded-orbit border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          {labels.delete}
        </button>
      </div>
    </div>
  );
}
