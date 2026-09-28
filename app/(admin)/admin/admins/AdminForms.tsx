'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveAdminAction, toggleAdminAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '', password: '', passwordFor: '' };

export interface AdminValues {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  branchId: number;
  isSelf: boolean;
}

/**
 * Creating or editing one admin account.
 *
 * The branch picker appears only for a Branch Admin, because a Super Admin is
 * never tied to one — the server clears it either way, and showing it would
 * suggest otherwise.
 */
export function AdminForm({
  values,
  branches,
  cancelHref,
  labels,
}: {
  values: AdminValues;
  branches: { id: number; label: string }[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveAdminAction, EMPTY);
  const [role, setRole] = useState(values.role);
  const [generate, setGenerate] = useState(false);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-4">
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

      {state.password !== '' && (
        <Alert tone="warning">
          <p className="font-semibold">{labels.passwordTitle}</p>
          <p className="mt-1 font-mono text-base">{state.password}</p>
          <p className="mt-1 text-xs">
            {state.passwordFor} · {labels.passwordNote}
          </p>
        </Alert>
      )}

      <label className="block text-xs font-medium text-ink">
        {labels.name} *
        <input
          name="name"
          required
          maxLength={191}
          defaultValue={values.name}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.email} *
        <input
          type="email"
          name="email"
          required
          maxLength={255}
          defaultValue={values.email}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {labels.emailHelp}
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.role}
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.currentTarget.value)}
            disabled={values.isSelf}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="super_admin">{labels.roleSuper}</option>
            <option value="branch_admin">{labels.roleBranch}</option>
          </select>
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.roleHelp}
          </span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select
            name="status"
            defaultValue={values.status}
            disabled={values.isSelf}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="active">{labels.statusActive}</option>
            <option value="locked">{labels.statusLocked}</option>
          </select>
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {values.isSelf ? labels.selfNote : labels.statusHelp}
          </span>
        </label>

        {role === 'branch_admin' && (
          <label className="block text-xs font-medium text-ink">
            {labels.branch} *
            <select
              name="branch_id"
              defaultValue={String(values.branchId || '')}
              className={`mt-1 ${CONTROL}`}
            >
              <option value="">{labels.branchChoose}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.branchHelp}
            </span>
          </label>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="generate_password"
          value="1"
          checked={generate}
          onChange={(event) => setGenerate(event.currentTarget.checked)}
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
        />
        <span>{labels.generate}</span>
      </label>

      {!generate && (
        <label className="block text-xs font-medium text-ink">
          {editing ? labels.passwordNew : `${labels.password} *`}
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required={!editing}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {editing ? labels.passwordEditHelp : labels.passwordHelp}
          </span>
        </label>
      )}

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
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/**
 * Locking or unlocking one account.
 *
 * Accounts are never deleted — who did what has to stay on record — so this is
 * the only way an admin stops having access.
 */
export function AdminToggle({
  adminId,
  isActive,
  disabled,
  labels,
}: {
  adminId: number;
  isActive: boolean;
  disabled: boolean;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(toggleAdminAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.errors.length > 0) {
    return <span className="text-xs text-red-600">{state.errors[0]}</span>;
  }
  if (state.message !== '') {
    return <span className="text-xs text-emerald-700 dark:text-emerald-400">{state.message}</span>;
  }

  if (disabled) {
    return (
      <span title={labels.selfNote} className={`${SMALL} opacity-50`}>
        {isActive ? labels.lock : labels.unlock}
      </span>
    );
  }

  // Unlocking needs no confirmation; locking signs somebody out at once.
  if (!isActive || !asking) {
    return (
      <form action={action} className="inline">
        <input type="hidden" name="id" value={adminId} />
        {isActive ? (
          <button type="button" onClick={() => setAsking(true)} className={SMALL}>
            {labels.lock}
          </button>
        ) : (
          <button type="submit" disabled={pending} className={`${SMALL} disabled:opacity-60`}>
            {labels.unlock}
          </button>
        )}
      </form>
    );
  }

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={adminId} />
      <span className="text-xs text-ink-muted">{labels.lockConfirm}</span>
      <button
        type="submit"
        disabled={pending}
        className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
      >
        {labels.lock}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={SMALL}>
        {labels.cancel}
      </button>
    </form>
  );
}
