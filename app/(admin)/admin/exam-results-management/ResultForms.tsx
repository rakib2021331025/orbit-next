'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { deleteResultAction, saveResultAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { error: '', message: '' };

export interface ResultValues {
  id: number;
  studentId: number;
  examName: string;
  subject: string;
  marks: string;
  total: string;
  grade: string;
  feedback: string;
  examDate: string;
}

/**
 * One hand-entered result.
 *
 * The grade is optional and the form **suggests** one from the percentage
 * rather than filling it in: the letter is what the institute printed on that
 * exam's paper, and quietly writing a computed grade into a saved record would
 * change what a certificate says.
 */
export function ResultForm({
  values,
  students,
  scale,
  cancelHref,
  labels,
}: {
  values: ResultValues;
  students: { id: number; label: string }[];
  /** [minimum percentage, letter] bands, highest first. */
  scale: [number, string][];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveResultAction, EMPTY);
  const [marks, setMarks] = useState(values.marks);
  const [total, setTotal] = useState(values.total);
  const [grade, setGrade] = useState(values.grade);

  const marksNumber = Number(marks);
  const totalNumber = Number(total);
  const usable =
    marks !== '' &&
    total !== '' &&
    Number.isFinite(marksNumber) &&
    Number.isFinite(totalNumber) &&
    totalNumber > 0 &&
    marksNumber >= 0 &&
    marksNumber <= totalNumber;

  const percentage = usable ? (marksNumber / totalNumber) * 100 : 0;
  const suggested = usable
    ? (scale.find(([minimum]) => percentage >= minimum)?.[1] ?? 'F')
    : '';
  const tooHigh =
    marks !== '' && total !== '' && Number.isFinite(marksNumber) && totalNumber > 0
      ? marksNumber > totalNumber
      : false;

  return (
    <form action={action} id="resultForm" className="space-y-4">
      <input type="hidden" name="id" value={values.id} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium text-ink sm:col-span-2">
          {labels.student} *
          <select
            name="student_id"
            required
            defaultValue={String(values.studentId || '')}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="">{labels.select}</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.examName} *
          <input
            name="exam_name"
            required
            maxLength={255}
            placeholder={labels.examNamePlaceholder}
            defaultValue={values.examName}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.subject} *
          <input
            name="subject"
            required
            maxLength={255}
            defaultValue={values.subject}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.obtained} *
          <input
            type="number"
            name="marks_obtained"
            required
            step="0.01"
            min="0"
            max="999.99"
            inputMode="decimal"
            value={marks}
            onChange={(event) => setMarks(event.currentTarget.value)}
            className={`mt-1 ${CONTROL} ${tooHigh ? 'border-red-500' : ''}`}
          />
          {tooHigh && <span className="mt-1 block text-[11px] text-red-600">{labels.tooHigh}</span>}
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.totalMarks} *
          <input
            type="number"
            name="total_marks"
            required
            step="0.01"
            min="0.01"
            max="999.99"
            inputMode="decimal"
            value={total}
            onChange={(event) => setTotal(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.grade} <span className="text-ink-muted">({labels.optional})</span>
          <input
            name="grade"
            maxLength={10}
            autoComplete="off"
            placeholder={labels.gradePlaceholder}
            value={grade}
            onChange={(event) => setGrade(event.currentTarget.value)}
            className={`mt-1 ${CONTROL}`}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {labels.gradeHint}
          </span>
          {suggested !== '' && (
            <span className="mt-1 block text-[11px] font-normal text-ink-muted" aria-live="polite">
              {labels.suggested
                .replace('{grade}', suggested)
                .replace('{pct}', String(Math.round(percentage * 100) / 100))}
              <button
                type="button"
                onClick={() => setGrade(suggested)}
                className="ms-1 align-baseline text-primary underline"
              >
                {labels.useSuggested}
              </button>
            </span>
          )}
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.examDate}
          <input
            type="date"
            name="exam_date"
            defaultValue={values.examDate}
            className={`mt-1 ${CONTROL}`}
          />
        </label>

        <label className="block text-xs font-medium text-ink sm:col-span-2 lg:col-span-4">
          {labels.feedback}
          <textarea
            name="feedback"
            rows={2}
            maxLength={5000}
            defaultValue={values.feedback}
            className={`mt-1 ${CONTROL}`}
          />
        </label>
      </div>

      <p className="text-xs text-ink-muted">
        <span className="font-semibold">{labels.scale}:</span>{' '}
        {scale
          .map(([minimum, letter], index) =>
            minimum > 0 ? `${letter} ≥ ${minimum}%` : `${letter} < ${scale[index - 1][0]}%`
          )
          .join(' · ')}
      </p>

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

/** Deleting one hand-entered result. */
export function DeleteResult({
  resultId,
  studentId,
  labels,
}: {
  resultId: number;
  studentId: number;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deleteResultAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.error !== '') return <span className="text-xs text-red-600">{state.error}</span>;

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
      <input type="hidden" name="id" value={resultId} />
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
