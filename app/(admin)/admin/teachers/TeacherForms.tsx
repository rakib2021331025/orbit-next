'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import {
  saveTeacherAction,
  setPasswordAction,
  toggleTeacherAction,
  deleteTeacherAction,
  toggleWebsiteAction,
} from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const BAD = 'border-red-400 focus:border-red-500 focus:ring-red-500/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '', field: '', password: '' };

export interface TeacherValues {
  id: number;
  name: string;
  email: string;
  phone: string;
  designation: string;
  qualification: string;
  bio: string;
  status: string;
  subjects: string;
  batches: string;
  name_bn: string;
  designation_bn: string;
  qualification_bn: string;
  experience: string;
  experience_bn: string;
  bio_bn: string;
  sort_order: number;
  show_on_website: boolean;
  photo: string;
}

/** The one-time password panel. */
function PasswordPanel({
  password,
  name,
  labels,
}: {
  password: string;
  name: string;
  labels: Record<string, string>;
}) {
  if (password === '') return null;

  return (
    <div className="rounded-orbit border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
      <p className="font-semibold text-emerald-900 dark:text-emerald-200">
        {labels.tempTitle.replace('{name}', name)}
      </p>
      <p className="mt-2 font-mono text-lg font-bold">{password}</p>
      {/* It exists nowhere else: the database holds only the hash. */}
      <p className="mt-1 text-xs text-ink-muted">{labels.tempNote}</p>
    </div>
  );
}

/** Creating or editing a teacher account. */
export function TeacherForm({
  values,
  branches,
  checkedBranches,
  photoUrl,
  cancelHref,
  labels,
}: {
  values: TeacherValues;
  branches: { id: number; name: string }[];
  checkedBranches: number[];
  photoUrl: string;
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveTeacherAction, EMPTY);
  const editing = values.id > 0;
  const cls = (field: string) => `mt-1 ${CONTROL} ${state.field === field ? BAD : ''}`;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={values.id} />
      {branches.length > 0 && <input type="hidden" name="branches_field" value="1" />}

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}
      <PasswordPanel password={state.password} name={values.name} labels={labels} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-heading">{labels.secProfile}</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.name} *
            <input name="name" required maxLength={255} defaultValue={values.name} className={cls('name')} />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.email} *
            <input
              name="email"
              type="email"
              required
              maxLength={255}
              defaultValue={values.email}
              className={cls('email')}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.emailHelp}
            </span>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.phone}
            <input name="phone" defaultValue={values.phone} className={cls('phone')} />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.phoneHelp}
            </span>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.designation}
            <input
              name="designation"
              maxLength={150}
              placeholder={labels.designationPlaceholder}
              defaultValue={values.designation}
              className={cls('designation')}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.qualification}
            <input
              name="qualification"
              maxLength={255}
              placeholder={labels.qualificationPlaceholder}
              defaultValue={values.qualification}
              className={cls('qualification')}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.status}
            <select name="status" defaultValue={values.status} className={cls('status')}>
              <option value="active">{labels.statusActiveLong}</option>
              <option value="inactive">{labels.statusInactiveLong}</option>
            </select>
          </label>
        </div>

        <label className="block text-xs font-medium text-ink">
          {labels.bio}
          <textarea name="bio" rows={3} defaultValue={values.bio} className={cls('bio')} />
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-heading">{labels.secAssign}</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.subjects}
            <textarea
              name="subjects"
              rows={2}
              placeholder={labels.subjectsPlaceholder}
              defaultValue={values.subjects}
              className={cls('subjects')}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.listHelp}
            </span>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.batches}
            <textarea
              name="batches"
              rows={2}
              placeholder={labels.batchesPlaceholder}
              defaultValue={values.batches}
              className={cls('batches')}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.listHelp}
            </span>
          </label>
        </div>

        {branches.length > 0 && (
          <div>
            <p className="text-xs font-medium text-ink">{labels.branches}</p>
            <div className="mt-1 flex flex-wrap gap-3">
              {branches.map((branch) => (
                <label key={branch.id} className="flex items-center gap-1.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="branches"
                    value={branch.id}
                    defaultChecked={checkedBranches.includes(branch.id)}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                  />
                  <span>{branch.name}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">{labels.branchesHelp}</p>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-heading">{labels.secAccess}</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.photo}
            <input
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              className={cls('photo')}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {editing ? labels.photoKeep : labels.photoHelp}
            </span>
          </label>

          {photoUrl !== '' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className="h-20 w-20 rounded-full border border-line-soft object-cover"
            />
          )}

          {/* Only on creation: an existing teacher's password is changed from
              its own action, which also signs their devices out. */}
          {!editing && (
            <label className="block text-xs font-medium text-ink">
              {labels.password}
              <input
                name="password"
                type="text"
                autoComplete="new-password"
                className={cls('password')}
              />
              <span className="mt-1 block text-[11px] font-normal text-ink-muted">
                {labels.passwordHelp}
              </span>
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-heading">{labels.secWebsite}</legend>
        <p className="text-[11px] text-ink-muted">{labels.secWebsiteHelp}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.nameBn}
            <input
              name="name_bn"
              lang="bn"
              maxLength={255}
              defaultValue={values.name_bn}
              className={cls('name_bn')}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.designationBn}
            <input
              name="designation_bn"
              lang="bn"
              maxLength={150}
              defaultValue={values.designation_bn}
              className={cls('designation_bn')}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.qualificationBn}
            <input
              name="qualification_bn"
              lang="bn"
              maxLength={255}
              defaultValue={values.qualification_bn}
              className={cls('qualification_bn')}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.experience}
            <input
              name="experience"
              maxLength={200}
              placeholder={labels.experiencePlaceholder}
              defaultValue={values.experience}
              className={cls('experience')}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.experienceBn}
            <input
              name="experience_bn"
              lang="bn"
              maxLength={200}
              placeholder={labels.experienceBnPlaceholder}
              defaultValue={values.experience_bn}
              className={cls('experience_bn')}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.sort}
            <input
              name="sort_order"
              type="number"
              min={0}
              max={9999}
              defaultValue={values.sort_order}
              className={cls('sort_order')}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.sortHelp}
            </span>
          </label>
        </div>

        <label className="block text-xs font-medium text-ink">
          {labels.bioBn}
          <textarea
            name="bio_bn"
            lang="bn"
            rows={3}
            defaultValue={values.bio_bn}
            className={cls('bio_bn')}
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="show_on_website"
            value="1"
            defaultChecked={values.show_on_website}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
          />
          <span>{labels.showWeb}</span>
        </label>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {editing ? labels.save : labels.create}
        </button>
        <Link href={cancelHref} className={SMALL}>
          {labels.back}
        </Link>
      </div>
    </form>
  );
}

/** Password, activate/deactivate, website and delete — on one teacher. */
export function TeacherRowActions({
  teacherId,
  teacherName,
  status,
  onWebsite,
  editHref,
  labels,
}: {
  teacherId: number;
  teacherName: string;
  status: string;
  onWebsite: boolean;
  editHref: string;
  labels: Record<string, string>;
}) {
  const [passwordState, passwordAction, passwordPending] = useActionState(setPasswordAction, EMPTY);
  const [toggleState, toggleAction, togglePending] = useActionState(toggleTeacherAction, EMPTY);
  const [webState, webAction, webPending] = useActionState(toggleWebsiteAction, EMPTY);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTeacherAction, EMPTY);
  const [panel, setPanel] = useState<'' | 'password' | 'delete'>('');

  const error = passwordState.error || toggleState.error || webState.error || deleteState.error;
  const done = [passwordState, toggleState, webState].find((state) => state.message !== '');

  return (
    <div className="space-y-2">
      {error !== '' && <span className="block text-end text-xs text-red-600">{error}</span>}
      {done && (
        <span className="block text-end text-xs text-emerald-700 dark:text-emerald-400">
          {done.message}
        </span>
      )}
      <PasswordPanel password={passwordState.password} name={teacherName} labels={labels} />

      {panel === 'password' && (
        <form action={passwordAction} className="space-y-2 rounded-orbit border border-line bg-surface-2/50 p-3 text-start">
          <input type="hidden" name="id" value={teacherId} />
          <p className="text-sm font-semibold text-ink-heading">
            {labels.passwordFor.replace('{name}', teacherName)}
          </p>
          <input
            name="password"
            type="text"
            autoComplete="new-password"
            placeholder={labels.password}
            className={CONTROL}
          />
          <p className="text-[11px] text-ink-muted">{labels.passwordNote}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={passwordPending}
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

      {panel === 'delete' && (
        <form action={deleteAction} className="flex flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="id" value={teacherId} />
          <span className="text-xs text-ink">
            {labels.confirmDelete.replace('{name}', teacherName)}
          </span>
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
        <Link href={editHref} className={SMALL}>
          {labels.edit}
        </Link>

        <button
          type="button"
          onClick={() => setPanel(panel === 'password' ? '' : 'password')}
          className={SMALL}
        >
          {labels.changePassword}
        </button>

        <form action={toggleAction} className="inline">
          <input type="hidden" name="id" value={teacherId} />
          <button type="submit" disabled={togglePending} className={SMALL}>
            {status === 'active' ? labels.deactivate : labels.activate}
          </button>
        </form>

        <form action={webAction} className="inline">
          <input type="hidden" name="id" value={teacherId} />
          <button type="submit" disabled={webPending} className={SMALL}>
            {onWebsite ? labels.webHide : labels.webShow}
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
