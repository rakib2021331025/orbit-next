'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveStudentAction, issueStudentIdAction } from './actions';
import { emptyStudentState } from './state';

export interface BatchChoice {
  id: number;
  label: string;
}

export interface StudentEditValues {
  id: number;
  name: string;
  name_bn: string;
  roll_number: string;
  batch_id: number;
  student_status: string;
  branch_id: number | null;
}

/**
 * One row's actions: edit the upgrade fields, or issue a missing Student ID.
 *
 * The edit form opens in place rather than on its own page — an admin correcting
 * a Bangla spelling is looking at the list, and a round trip to a detail page and
 * back loses their place in it.
 *
 * The Student ID itself is never editable. It is allocated by the server and
 * printed on cards, so a typo here would invalidate paper already in a pocket;
 * `astd.id_fixed` says so where an admin would look for the field.
 */
export function StudentRowActions({
  values,
  batches,
  hasStudentId,
  labels,
}: {
  values: StudentEditValues;
  batches: BatchChoice[];
  hasStudentId: boolean;
  labels: Record<string, string>;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveStudentAction, emptyStudentState);
  const [idState, idAction, idPending] = useActionState(issueStudentIdAction, emptyStudentState);
  const [open, setOpen] = useState(false);

  const button =
    'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';
  const control =
    'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {idState.error !== '' && (
          <span className="w-full text-end text-xs text-red-600">{idState.error}</span>
        )}
        {idState.message !== '' && (
          <span className="w-full text-end text-xs text-emerald-700">{idState.message}</span>
        )}

        <button type="button" onClick={() => setOpen(!open)} className={button} aria-expanded={open}>
          {labels.edit}
        </button>

        <Link href={`/admin/students/${values.id}`} className={button}>
          {labels.profile}
        </Link>

        <a
          href={`/api/id-card?id=${values.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          {labels.idCard}
        </a>

        <a
          href={`/api/marksheet?student=${values.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          {labels.marksheet}
        </a>

        {!hasStudentId && (
          <form action={idAction} className="inline">
            <input type="hidden" name="student_id" value={values.id} />
            <button
              type="submit"
              disabled={idPending}
              title={labels.issueIdTitle}
              className="rounded-orbit bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary-hover"
            >
              {labels.issueId}
            </button>
          </form>
        )}
      </div>

      {open && (
        <form
          action={saveAction}
          className="space-y-3 rounded-orbit border border-line-soft bg-surface-2/50 p-3 text-start"
        >
          <input type="hidden" name="student_id" value={values.id} />
          <input type="hidden" name="branch_id" value={values.branch_id ?? ''} />

          <p className="text-sm font-semibold text-ink-heading">
            {labels.editFor.replace('{name}', values.name)}
          </p>

          {saveState.error !== '' && <Alert tone="danger">{saveState.error}</Alert>}
          {saveState.message !== '' && <Alert tone="success">{saveState.message}</Alert>}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-ink">
              {labels.name}
              <input
                name="name"
                required
                maxLength={255}
                defaultValue={values.name}
                className={`mt-1 ${control}`}
              />
            </label>

            <label className="block text-xs font-medium text-ink">
              {labels.nameBn}
              <input
                name="name_bn"
                maxLength={255}
                defaultValue={values.name_bn}
                placeholder={labels.nameBnPlaceholder}
                className={`mt-1 ${control}`}
              />
              <span className="mt-1 block text-[11px] font-normal text-ink-muted">
                {labels.nameBnHelp}
              </span>
            </label>

            <label className="block text-xs font-medium text-ink">
              {labels.roll}
              <input
                name="roll_number"
                maxLength={20}
                defaultValue={values.roll_number}
                className={`mt-1 ${control}`}
              />
              <span className="mt-1 block text-[11px] font-normal text-ink-muted">
                {labels.rollHelp}
              </span>
            </label>

            <label className="block text-xs font-medium text-ink">
              {labels.batch}
              <select
                name="batch_id"
                defaultValue={String(values.batch_id || 0)}
                className={`mt-1 ${control}`}
              >
                <option value="0">{labels.notAssigned}</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-ink">
              {labels.status}
              <select
                name="student_status"
                defaultValue={values.student_status}
                className={`mt-1 ${control}`}
              >
                <option value="Active">{labels.statusActive}</option>
                <option value="Inactive">{labels.statusInactive}</option>
              </select>
            </label>
          </div>

          <p className="text-[11px] text-ink-muted">{labels.idFixed}</p>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={savePending}
              className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
            >
              {labels.save}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={button}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
