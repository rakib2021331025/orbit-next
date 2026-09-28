'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import {
  deleteExamAction,
  saveExamAction,
  saveMeritOptionsAction,
  toggleExamAction,
} from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY_FORM = { errors: [] as string[], message: '' };
const EMPTY_MERIT = { error: '', message: '' };

export interface MasterSubject {
  id: number;
  label: string;
  name: string;
  nameBn: string;
  active: boolean;
}

export interface SubjectRow {
  key: string;
  id: number;
  subjectId: number;
  name: string;
  nameBn: string;
  full: string;
  pass: string;
  /** A subject with marks already entered cannot be removed. */
  hasMarks: boolean;
}

export interface ExamValues {
  id: number;
  title: string;
  titleBn: string;
  month: string;
  examDate: string;
  courseId: number;
  batchId: number;
  showPosition: boolean;
  remarks: string;
  rows: SubjectRow[];
}

/**
 * Creating or editing one monthly exam, with its subject list.
 *
 * Two conveniences from the original, both of which save real typing:
 * choosing a subject fills in its names, and pass marks follow 33% of full
 * marks **until somebody types their own** — after that the typed value is
 * never overwritten.
 */
export function ExamForm({
  values,
  courses,
  batches,
  master,
  labels,
}: {
  values: ExamValues;
  courses: { id: number; label: string }[];
  batches: { id: number; courseId: number; label: string }[];
  master: MasterSubject[];
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveExamAction, EMPTY_FORM);
  const [courseId, setCourseId] = useState(String(values.courseId || ''));
  const [rows, setRows] = useState<SubjectRow[]>(
    values.rows.length > 0
      ? values.rows
      : [
          {
            key: 'n1',
            id: 0,
            subjectId: 0,
            name: '',
            nameBn: '',
            full: '',
            pass: '',
            hasMarks: false,
          },
        ]
  );
  // Which rows have a pass mark somebody typed, so the 33% default stops.
  const [touched, setTouched] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(values.rows.filter((row) => row.pass !== '').map((row) => [row.key, true]))
  );
  const [counter, setCounter] = useState(values.rows.length + 1);

  const visibleBatches = batches.filter(
    (batch) => courseId === '' || String(batch.courseId) === courseId
  );

  const update = (key: string, patch: Partial<SubjectRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = (subjectId = 0) => {
    const subject = master.find((item) => item.id === subjectId);
    const key = `n${counter}`;
    setCounter((value) => value + 1);
    setRows((current) => [
      ...current,
      {
        key,
        id: 0,
        subjectId,
        name: subject?.name ?? '',
        nameBn: subject?.nameBn ?? '',
        full: subject ? '100' : '',
        pass: subject ? '33' : '',
        hasMarks: false,
      },
    ]);
  };

  const addAllActive = () => {
    const present = new Set(rows.filter((row) => row.subjectId > 0).map((row) => row.subjectId));
    // Empty rows are dropped rather than left behind the list somebody asked for.
    const kept = rows.filter((row) => row.subjectId > 0 || row.name.trim() !== '' || row.hasMarks);
    let next = counter;
    const added: SubjectRow[] = [];

    for (const subject of master) {
      if (!subject.active || present.has(subject.id)) continue;
      added.push({
        key: `n${next++}`,
        id: 0,
        subjectId: subject.id,
        name: subject.name,
        nameBn: subject.nameBn,
        full: '100',
        pass: '33',
        hasMarks: false,
      });
    }

    setCounter(next);
    setRows([...kept, ...added]);
  };

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

      <div className="rounded-orbit border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink">
            {labels.name} *
            <input
              name="title"
              required
              maxLength={255}
              placeholder={labels.namePlaceholder}
              defaultValue={values.title}
              className={`mt-1 ${CONTROL}`}
            />
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.nameBn}
            <input
              name="title_bn"
              maxLength={255}
              lang="bn"
              defaultValue={values.titleBn}
              className={`mt-1 ${CONTROL}`}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-ink">
              {labels.month} *
              <input
                type="month"
                name="exam_month"
                required
                defaultValue={values.month}
                className={`mt-1 ${CONTROL}`}
              />
            </label>
            <label className="block text-xs font-medium text-ink">
              {labels.date}
              <input
                type="date"
                name="exam_date"
                defaultValue={values.examDate}
                className={`mt-1 ${CONTROL}`}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-ink">
              {labels.course}
              <select
                name="course_id"
                value={courseId}
                onChange={(event) => setCourseId(event.currentTarget.value)}
                className={`mt-1 ${CONTROL}`}
              >
                <option value="">{labels.noCourse}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-ink">
              {labels.batch}
              <select
                name="batch_id"
                key={courseId}
                defaultValue={String(values.batchId || '')}
                className={`mt-1 ${CONTROL}`}
              >
                <option value="">{labels.anyBatch}</option>
                {visibleBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-ink-muted">
                {labels.batchHint}
              </span>
            </label>
          </div>

          <label className="block text-xs font-medium text-ink sm:col-span-2">
            {labels.remarks}
            <textarea
              name="remarks"
              rows={2}
              maxLength={2000}
              defaultValue={values.remarks}
              className={`mt-1 ${CONTROL}`}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input
              type="checkbox"
              name="show_position"
              value="1"
              defaultChecked={values.showPosition}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span>{labels.showPosition}</span>
          </label>
        </div>
      </div>

      <div className="rounded-orbit border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-3">
          <h2 className="text-sm font-bold text-ink-heading">{labels.subjects}</h2>
          <div className="flex flex-wrap gap-2">
            {master.some((subject) => subject.active) && (
              <button type="button" onClick={addAllActive} className={SMALL}>
                <i className="bi bi-collection me-1" aria-hidden /> {labels.addAll}
              </button>
            )}
            <button type="button" onClick={() => addRow()} className={SMALL}>
              <i className="bi bi-plus-lg me-1" aria-hidden /> {labels.addSubject}
            </button>
          </div>
        </div>

        <div className="space-y-3 p-5">
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-2 rounded-orbit border border-line-soft p-3 sm:grid-cols-6"
            >
              <input type="hidden" name={`subjects[${row.key}][id]`} value={row.id} />

              <label className="block text-[11px] font-medium text-ink sm:col-span-2">
                {labels.subjectPick}
                <select
                  name={`subjects[${row.key}][subject_id]`}
                  value={row.subjectId || ''}
                  onChange={(event) => {
                    const id = Number(event.currentTarget.value || 0);
                    const subject = master.find((item) => item.id === id);
                    update(row.key, {
                      subjectId: id,
                      ...(subject ? { name: subject.name, nameBn: subject.nameBn } : {}),
                    });
                  }}
                  className={`mt-1 ${CONTROL}`}
                >
                  <option value="">{labels.customSubject}</option>
                  {master.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] font-medium text-ink">
                {labels.subjectName}
                <input
                  name={`subjects[${row.key}][name]`}
                  required
                  maxLength={255}
                  value={row.name}
                  onChange={(event) => update(row.key, { name: event.currentTarget.value })}
                  className={`mt-1 ${CONTROL}`}
                />
              </label>

              <label className="block text-[11px] font-medium text-ink">
                {labels.subjectNameBn}
                <input
                  name={`subjects[${row.key}][name_bn]`}
                  maxLength={255}
                  lang="bn"
                  value={row.nameBn}
                  onChange={(event) => update(row.key, { nameBn: event.currentTarget.value })}
                  className={`mt-1 ${CONTROL}`}
                />
              </label>

              <label className="block text-[11px] font-medium text-ink">
                {labels.fullMarks}
                <input
                  type="number"
                  name={`subjects[${row.key}][full]`}
                  required
                  min="0.01"
                  max="1000"
                  step="0.01"
                  value={row.full}
                  onChange={(event) => {
                    const full = event.currentTarget.value;
                    const number = Number(full);
                    update(row.key, {
                      full,
                      // 33% until somebody types their own pass mark.
                      ...(!touched[row.key]
                        ? { pass: Number.isFinite(number) && full !== '' ? String(Math.round(number * 33) / 100) : '' }
                        : {}),
                    });
                  }}
                  className={`mt-1 ${CONTROL}`}
                />
              </label>

              <div className="flex items-end gap-2">
                <label className="block flex-1 text-[11px] font-medium text-ink">
                  {labels.passMarks}
                  <input
                    type="number"
                    name={`subjects[${row.key}][pass]`}
                    min="0"
                    max="1000"
                    step="0.01"
                    value={row.pass}
                    onChange={(event) => {
                      setTouched((current) => ({ ...current, [row.key]: true }));
                      update(row.key, { pass: event.currentTarget.value });
                    }}
                    className={`mt-1 ${CONTROL}`}
                  />
                </label>

                {row.hasMarks ? (
                  <span
                    title={labels.hasMarksHint}
                    className="mb-1 rounded-orbit bg-surface-2 px-2 py-1 text-[11px] text-ink-muted"
                  >
                    {labels.hasMarks}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                    aria-label={labels.remove}
                    className={`mb-1 ${SMALL} text-red-600`}
                  >
                    <i className="bi bi-x-lg" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="border-t border-line-soft px-5 py-3 text-xs text-ink-muted">
          {labels.passAuto}
        </p>
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
          href="/admin/monthly-exams"
          className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/** Publish, or take a published result back to draft. */
export function PublishToggle({
  examId,
  published,
  labels,
}: {
  examId: number;
  published: boolean;
  labels: Record<string, string>;
}) {
  return (
    <form action={toggleExamAction} className="inline">
      <input type="hidden" name="id" value={examId} />
      <button
        type="submit"
        title={published ? labels.unpublish : labels.publish}
        aria-label={published ? labels.unpublish : labels.publish}
        className={SMALL}
      >
        <i className={`bi ${published ? 'bi-eye-slash' : 'bi-megaphone'}`} aria-hidden />
      </button>
    </form>
  );
}

/** Deleting a draft exam — marks and all, which is why it asks first. */
export function DeleteExam({
  examId,
  published,
  labels,
}: {
  examId: number;
  published: boolean;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deleteExamAction, EMPTY_FORM);
  const [asking, setAsking] = useState(false);

  if (state.errors.length > 0) {
    return <span className="text-xs text-red-600">{state.errors[0]}</span>;
  }

  if (published) {
    return (
      <button
        type="button"
        disabled
        title={labels.deletePublished}
        aria-label={labels.remove}
        className={`${SMALL} opacity-50`}
      >
        <i className="bi bi-trash" aria-hidden />
      </button>
    );
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label={labels.remove}
        className={`${SMALL} text-red-600`}
      >
        <i className="bi bi-trash" aria-hidden />
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={examId} />
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

/** The public-results options card above the list. */
export function MeritOptionsForm({
  meritPublic,
  meritSize,
  searchPublic,
  min,
  max,
  labels,
}: {
  meritPublic: boolean;
  meritSize: number;
  searchPublic: boolean;
  min: number;
  max: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveMeritOptionsAction, EMPTY_MERIT);

  return (
    <form action={action} className="space-y-3">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="flex flex-wrap items-center gap-4">
        <div className="me-auto min-w-48">
          <h2 className="text-sm font-bold text-ink-heading">
            <i className="bi bi-trophy me-1" aria-hidden /> {labels.title}
          </h2>
          <p className="text-xs text-ink-muted">{labels.sub}</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="merit_list_public"
            value="1"
            defaultChecked={meritPublic}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
          />
          <span>{labels.public}</span>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <span>{labels.size}</span>
          <input
            type="number"
            name="merit_list_size"
            min={min}
            max={max}
            step={1}
            required
            defaultValue={meritSize}
            title={labels.sizeHint}
            className="w-20 rounded-orbit border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="result_search_public"
            value="1"
            defaultChecked={searchPublic}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
          />
          <span>{labels.search}</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {labels.save}
          </button>
          <a
            href="/results"
            target="_blank"
            rel="noopener noreferrer"
            className={`${SMALL} px-3 py-1.5`}
          >
            <i className="bi bi-box-arrow-up-right me-1" aria-hidden /> {labels.preview}
          </a>
        </div>
      </div>
    </form>
  );
}
