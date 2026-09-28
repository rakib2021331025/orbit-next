'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import {
  deleteBranchAction,
  makeMainBranchAction,
  saveBranchAction,
  toggleBranchAction,
} from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '' };

export interface BranchValues {
  id: number;
  nameBn: string;
  nameEn: string;
  slug: string;
  addressBn: string;
  addressEn: string;
  descriptionBn: string;
  descriptionEn: string;
  phone: string;
  email: string;
  mapUrl: string;
  sortOrder: number;
  status: string;
  isMain: boolean;
  imageUrl: string;
}

export interface Pickable {
  id: number;
  label: string;
}

/** Adding or editing one branch, with its courses and teachers. */
export function BranchForm({
  values,
  courses,
  teachers,
  courseIds,
  teacherIds,
  siteUrl,
  labels,
}: {
  values: BranchValues;
  courses: Pickable[];
  teachers: Pickable[];
  courseIds: number[];
  teacherIds: number[];
  siteUrl: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveBranchAction, EMPTY);
  const [slug, setSlug] = useState(values.slug);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-6">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.nameBn} *
          <input
            name="name_bn"
            required
            maxLength={191}
            lang="bn"
            defaultValue={values.nameBn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.nameEn} *
          <input
            name="name_en"
            required
            maxLength={191}
            defaultValue={values.nameEn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink sm:col-span-2">
          {labels.slug}
          <input
            name="slug"
            maxLength={80}
            value={slug}
            onChange={(event) => setSlug(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.slugHelp.replace('{url}', `${siteUrl}/branches/${slug || '…'}`)}
          </span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.addressBn}
          <textarea
            name="address_bn"
            rows={2}
            maxLength={500}
            lang="bn"
            defaultValue={values.addressBn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.addressEn}
          <textarea
            name="address_en"
            rows={2}
            maxLength={500}
            defaultValue={values.addressEn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.descriptionBn}
          <textarea
            name="description_bn"
            rows={3}
            maxLength={4000}
            lang="bn"
            defaultValue={values.descriptionBn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.descriptionEn}
          <textarea
            name="description_en"
            rows={3}
            maxLength={4000}
            defaultValue={values.descriptionEn}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <p className="text-[11px] text-ink-muted sm:col-span-2">{labels.descriptionHelp}</p>

        <label className="block text-xs font-medium text-ink">
          {labels.phone}
          <input
            name="phone"
            type="tel"
            maxLength={30}
            defaultValue={values.phone}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.email}
          <input
            name="email"
            type="email"
            maxLength={191}
            defaultValue={values.email}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink sm:col-span-2">
          {labels.mapUrl}
          <input
            name="map_url"
            maxLength={1000}
            defaultValue={values.mapUrl}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.mapHelp}
          </span>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.sort}
          <input
            type="number"
            name="sort_order"
            min={0}
            max={9999}
            defaultValue={values.sortOrder}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.status}
          <select
            name="status"
            defaultValue={values.status}
            disabled={values.isMain}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="active">{labels.statusActive}</option>
            <option value="inactive">{labels.statusInactive}</option>
          </select>
          {values.isMain && (
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.mainInactive}
            </span>
          )}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="text-xs font-medium text-ink">{labels.courses}</legend>
          <p className="mt-1 text-[11px] text-ink-muted">{labels.coursesHelp}</p>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-orbit border border-line-soft p-2">
            {courses.length === 0 ? (
              <p className="text-xs text-ink-muted">{labels.noCourses}</p>
            ) : (
              courses.map((course) => (
                <label key={course.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="courses"
                    value={course.id}
                    defaultChecked={courseIds.includes(course.id)}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                  />
                  <span>{course.label}</span>
                </label>
              ))
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium text-ink">{labels.teachers}</legend>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-orbit border border-line-soft p-2">
            {teachers.length === 0 ? (
              <p className="text-xs text-ink-muted">{labels.noTeachers}</p>
            ) : (
              teachers.map((teacher) => (
                <label key={teacher.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="teachers"
                    value={teacher.id}
                    defaultChecked={teacherIds.includes(teacher.id)}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                  />
                  <span>{teacher.label}</span>
                </label>
              ))
            )}
          </div>
        </fieldset>
      </div>

      <div className="space-y-2">
        {values.imageUrl !== '' && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={values.imageUrl}
              alt=""
              className="h-20 w-auto rounded-orbit bg-surface-2 object-contain"
            />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="remove_image"
                value="1"
                className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
              />
              <span>{labels.removeImage}</span>
            </label>
          </>
        )}

        <label className="block text-xs font-medium text-ink">
          {labels.image}
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.imageHelp}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
        <Link
          href="/admin/branches"
          className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {editing ? labels.back : labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/** Activate / deactivate, make main, and delete for one branch row. */
export function BranchRowActions({
  branchId,
  status,
  isMain,
  hasRecords,
  labels,
}: {
  branchId: number;
  status: string;
  isMain: boolean;
  hasRecords: boolean;
  labels: Record<string, string>;
}) {
  const [toggleState, toggle, togglePending] = useActionState(toggleBranchAction, EMPTY);
  const [mainState, makeMain, mainPending] = useActionState(makeMainBranchAction, EMPTY);
  const [deleteState, remove, removePending] = useActionState(deleteBranchAction, EMPTY);
  const [asking, setAsking] = useState(false);

  const errors = [...toggleState.errors, ...mainState.errors, ...deleteState.errors];

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {errors.length > 0 && (
        <span className="w-full text-end text-xs text-red-600">{errors[0]}</span>
      )}

      {!isMain && status === 'active' && (
        <form action={makeMain} className="inline">
          <input type="hidden" name="id" value={branchId} />
          <button type="submit" disabled={mainPending} className={`${SMALL} disabled:opacity-60`}>
            {labels.setMain}
          </button>
        </form>
      )}

      {!isMain && (
        <form action={toggle} className="inline">
          <input type="hidden" name="id" value={branchId} />
          <button type="submit" disabled={togglePending} className={`${SMALL} disabled:opacity-60`}>
            {status === 'active' ? labels.deactivate : labels.activate}
          </button>
        </form>
      )}

      <Link
        href={`/admin/branches/${branchId}/edit`}
        title={labels.edit}
        aria-label={labels.edit}
        className={SMALL}
      >
        <i className="bi bi-pencil" aria-hidden />
      </Link>

      {isMain || hasRecords ? (
        <span
          title={isMain ? labels.mainDelete : labels.cantDelete}
          className={`${SMALL} opacity-50`}
        >
          <i className="bi bi-trash" aria-hidden />
        </span>
      ) : asking ? (
        <form action={remove} className="inline-flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="id" value={branchId} />
          <span className="text-xs text-ink-muted">{labels.confirm}</span>
          <button
            type="submit"
            disabled={removePending}
            className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
          >
            {labels.remove}
          </button>
          <button type="button" onClick={() => setAsking(false)} className={SMALL}>
            {labels.cancel}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          title={labels.remove}
          aria-label={labels.remove}
          className={`${SMALL} text-red-600`}
        >
          <i className="bi bi-trash" aria-hidden />
        </button>
      )}
    </div>
  );
}
