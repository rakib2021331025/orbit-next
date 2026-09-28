'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { saveCourseAction } from './actions';
import { emptyCourseState } from './state';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

export interface CourseFormValues {
  id: number;
  name: string;
  name_bn: string;
  course_type: string;
  short_description: string;
  short_description_bn: string;
  description: string;
  description_bn: string;
  fee: string;
  duration: string;
  duration_bn: string;
  batch_info: string;
  batch_info_bn: string;
  teacher_id: number;
  instructor_name: string;
  status: string;
  enrollment_status: string;
  is_featured: boolean;
  sort_order: number;
  image: string;
}

/**
 * The course form.
 *
 * Every text field comes in an English and a Bangla version, side by side rather
 * than behind a language switch: the public site shows whichever the visitor is
 * reading, and a missing Bangla title is much easier to notice when the empty box
 * is next to the filled one.
 *
 * `branches_field` is a hidden marker. Its presence tells the server the form
 * actually carried branch checkboxes, so a single-branch install — which shows
 * none — never wipes the mapping it has.
 */
export function CourseForm({
  values,
  teachers,
  branches,
  checkedBranches,
  imageUrl,
  labels,
}: {
  values: CourseFormValues;
  teachers: { id: number; name: string; designation: string | null; active: boolean }[];
  branches: { id: number; name: string }[];
  checkedBranches: number[];
  imageUrl: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveCourseAction, emptyCourseState);
  const [type, setType] = useState(values.course_type);
  const editing = values.id > 0;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="course_id" value={values.id} />
      {branches.length > 0 && <input type="hidden" name="branches_field" value="1" />}

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-heading">{labels.secBasic}</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.name}
            <input name="name" maxLength={255} defaultValue={values.name} className={`mt-1 ${CONTROL}`} />
          </label>
          <label className="block text-xs font-medium text-ink">
            {labels.nameBn}
            <input
              name="name_bn"
              maxLength={255}
              lang="bn"
              defaultValue={values.name_bn}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </div>

        <label className="block text-xs font-medium text-ink">
          {labels.type}
          <select
            name="course_type"
            value={type}
            onChange={(event) => setType(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="offline">{labels.typeOffline}</option>
            <option value="online">{labels.typeOnline}</option>
            <option value="hybrid">{labels.typeHybrid}</option>
          </select>
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.typeHelp}</span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
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

          {imageUrl !== '' && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="h-24 w-full rounded-orbit border border-line-soft object-cover"
              />
              <label className="flex items-center gap-2 text-xs text-ink">
                <input
                  type="checkbox"
                  name="remove_image"
                  value="1"
                  className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                />
                <span>{labels.removeImage}</span>
              </label>
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-heading">{labels.secContent}</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.short}
            <textarea
              name="short_description"
              rows={2}
              maxLength={500}
              defaultValue={values.short_description}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
          <label className="block text-xs font-medium text-ink">
            {labels.shortBn}
            <textarea
              name="short_description_bn"
              rows={2}
              maxLength={500}
              lang="bn"
              defaultValue={values.short_description_bn}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </div>
        <p className="text-[11px] text-ink-muted">{labels.shortHelp}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.desc}
            <textarea
              name="description"
              rows={5}
              defaultValue={values.description}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
          <label className="block text-xs font-medium text-ink">
            {labels.descBn}
            <textarea
              name="description_bn"
              rows={5}
              lang="bn"
              defaultValue={values.description_bn}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-heading">{labels.secDetails}</legend>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-ink">
            {labels.fee}
            <input
              name="fee"
              type="number"
              step="0.01"
              min="0"
              defaultValue={values.fee}
              className={`mt-1 ${CONTROL}`}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.feeHelp}</span>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.duration}
            <input
              name="duration"
              maxLength={100}
              placeholder={labels.durationPlaceholder}
              defaultValue={values.duration}
              className={`mt-1 ${CONTROL}`}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.durationBn}
            <input
              name="duration_bn"
              maxLength={100}
              lang="bn"
              defaultValue={values.duration_bn}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.batchInfo}
            <input
              name="batch_info"
              maxLength={255}
              placeholder={labels.batchInfoPlaceholder}
              defaultValue={values.batch_info}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
          <label className="block text-xs font-medium text-ink">
            {labels.batchInfoBn}
            <input
              name="batch_info_bn"
              maxLength={255}
              lang="bn"
              defaultValue={values.batch_info_bn}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.teacher}
            <select
              name="teacher_id"
              defaultValue={String(values.teacher_id || 0)}
              className={`mt-1 ${CONTROL}`}
            >
              <option value="0">{labels.teacherNone}</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                  {teacher.designation ? ` — ${teacher.designation}` : ''}
                  {!teacher.active ? ` (${labels.statusInactive})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.instructor}
            <input
              name="instructor_name"
              maxLength={255}
              defaultValue={values.instructor_name}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-heading">{labels.secVisibility}</legend>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-ink">
            {labels.status}
            <select name="status" defaultValue={values.status} className={`mt-1 ${CONTROL}`}>
              <option value="active">{labels.statusActiveLong}</option>
              <option value="inactive">{labels.statusInactiveLong}</option>
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.enrollment}
            <select
              name="enrollment_status"
              defaultValue={values.enrollment_status}
              className={`mt-1 ${CONTROL}`}
            >
              <option value="open">{labels.enrollOpen}</option>
              <option value="closed">{labels.enrollClosed}</option>
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.sort}
            <input
              name="sort_order"
              type="number"
              min={0}
              defaultValue={values.sort_order}
              className={`mt-1 ${CONTROL}`}
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              {labels.sortHelp}
            </span>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="is_featured"
            value="1"
            defaultChecked={values.is_featured}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
          />
          <span>{labels.featured}</span>
        </label>

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
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {labels.save}
        </button>
        <Link
          href="/admin/courses"
          className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {editing ? labels.back : labels.cancel}
        </Link>
      </div>
    </form>
  );
}
