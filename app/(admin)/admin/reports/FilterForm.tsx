'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ReportType } from '@/lib/reports/core';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

export interface Option {
  value: string;
  label: string;
  /** Batches carry their course, so only the chosen course's batches are offered. */
  course?: number;
}

export interface FilterValues {
  course: string;
  batch: string;
  status: string;
  state: string;
  method: string;
  month: string;
  from: string;
  to: string;
  exam: string;
  result: string;
  q: string;
}

/**
 * The filter bar for one report, from the form in admin/reports.php.
 *
 * Three behaviours here are not decoration:
 *
 *   - only the chosen course's batches are offered, so a filter pair that
 *     matches nothing cannot be built by accident;
 *   - a month and a From–To range are alternatives, and choosing one clears the
 *     other, because the month silently wins on the server;
 *   - picking another exam submits at once — nobody wants to choose an exam and
 *     then hunt for a button.
 */
export function FilterForm({
  report,
  values,
  courses,
  batches,
  exams,
  resultCodes,
  methods,
  filtered,
  labels,
}: {
  report: ReportType;
  values: FilterValues;
  courses: Option[];
  batches: Option[];
  exams: Option[];
  resultCodes: Option[];
  methods: Option[];
  filtered: boolean;
  labels: Record<string, string>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [course, setCourse] = useState(values.course);
  const [month, setMonth] = useState(values.month);
  const [from, setFrom] = useState(values.from);
  const [to, setTo] = useState(values.to);

  const visibleBatches = batches.filter(
    (batch) => course === '' || course === '0' || String(batch.course ?? 0) === course
  );

  return (
    <form
      ref={form}
      method="get"
      action="/admin/reports"
      className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input type="hidden" name="report" value={report} />

      {(report === 'students' || report === 'dues') && (
        <>
          <label className="block text-xs font-medium text-ink">
            {labels.course}
            <select
              name="course"
              value={course}
              onChange={(event) => setCourse(event.currentTarget.value)}
              className={`mt-1 ${CONTROL}`}
            >
              <option value="">{labels.anyCourse}</option>
              {courses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.batch}
            <select
              name="batch"
              defaultValue={values.batch}
              key={course}
              className={`mt-1 ${CONTROL}`}
            >
              <option value="">{labels.anyBatch}</option>
              {visibleBatches.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {report === 'students' && (
            <label className="block text-xs font-medium text-ink">
              {labels.status}
              <select name="status" defaultValue={values.status} className={`mt-1 ${CONTROL}`}>
                <option value="">{labels.anyStatus}</option>
                <option value="Active">{labels.statusActive}</option>
                <option value="Inactive">{labels.statusInactive}</option>
              </select>
            </label>
          )}

          <label className="block text-xs font-medium text-ink">
            {labels.search}
            <input
              type="search"
              name="q"
              maxLength={100}
              defaultValue={values.q}
              placeholder={labels.searchStudent}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </>
      )}

      {report === 'enrollments' && (
        <>
          <label className="block text-xs font-medium text-ink">
            {labels.status}
            <select name="state" defaultValue={values.state} className={`mt-1 ${CONTROL}`}>
              <option value="">{labels.anyStatus}</option>
              <option value="pending">{labels.statePending}</option>
              <option value="approved">{labels.stateApproved}</option>
              <option value="rejected">{labels.stateRejected}</option>
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.method}
            <select name="method" defaultValue={values.method} className={`mt-1 ${CONTROL}`}>
              <option value="">{labels.anyMethod}</option>
              <option value="bkash">{labels.methodBkash}</option>
              <option value="nagad">{labels.methodNagad}</option>
              <option value="none">{labels.methodNone}</option>
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.course}
            <select name="course" defaultValue={values.course} className={`mt-1 ${CONTROL}`}>
              <option value="">{labels.anyCourse}</option>
              {courses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-ink">
              {labels.from}
              <input type="date" name="from" defaultValue={values.from} className={`mt-1 ${CONTROL}`} />
            </label>
            <label className="block text-xs font-medium text-ink">
              {labels.to}
              <input type="date" name="to" defaultValue={values.to} className={`mt-1 ${CONTROL}`} />
            </label>
          </div>

          <label className="block text-xs font-medium text-ink sm:col-span-2">
            {labels.search}
            <input
              type="search"
              name="q"
              maxLength={100}
              defaultValue={values.q}
              placeholder={labels.searchApplication}
              className={`mt-1 ${CONTROL}`}
            />
          </label>
        </>
      )}

      {report === 'payments' && (
        <>
          <label className="block text-xs font-medium text-ink">
            {labels.month}
            <input
              type="month"
              name="month"
              value={month}
              onChange={(event) => {
                setMonth(event.currentTarget.value);
                if (event.currentTarget.value !== '') {
                  setFrom('');
                  setTo('');
                }
              }}
              className={`mt-1 ${CONTROL}`}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-ink">
              {labels.from}
              <input
                type="date"
                name="from"
                value={from}
                onChange={(event) => {
                  setFrom(event.currentTarget.value);
                  if (event.currentTarget.value !== '') setMonth('');
                }}
                className={`mt-1 ${CONTROL}`}
              />
            </label>
            <label className="block text-xs font-medium text-ink">
              {labels.to}
              <input
                type="date"
                name="to"
                value={to}
                onChange={(event) => {
                  setTo(event.currentTarget.value);
                  if (event.currentTarget.value !== '') setMonth('');
                }}
                className={`mt-1 ${CONTROL}`}
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-ink">
            {labels.status}
            <select name="status" defaultValue={values.status} className={`mt-1 ${CONTROL}`}>
              <option value="">{labels.anyStatus}</option>
              <option value="paid">{labels.statusPaid}</option>
              <option value="unpaid">{labels.statusUnpaid}</option>
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.method}
            <select name="method" defaultValue={values.method} className={`mt-1 ${CONTROL}`}>
              <option value="">{labels.anyMethod}</option>
              {methods.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.course}
            <select name="course" defaultValue={values.course} className={`mt-1 ${CONTROL}`}>
              <option value="">{labels.anyCourse}</option>
              {courses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-ink sm:col-span-2">
            {labels.search}
            <input
              type="search"
              name="q"
              maxLength={100}
              defaultValue={values.q}
              placeholder={labels.searchPayment}
              className={`mt-1 ${CONTROL}`}
            />
          </label>

          <p className="text-[11px] text-ink-muted sm:col-span-2 lg:col-span-4">
            {labels.monthHint}
          </p>
        </>
      )}

      {report === 'results' && (
        <>
          <label className="block text-xs font-medium text-ink sm:col-span-2">
            {labels.exam}
            <select
              name="exam"
              defaultValue={values.exam}
              disabled={exams.length === 0}
              onChange={() => form.current?.requestSubmit()}
              className={`mt-1 ${CONTROL}`}
            >
              {exams.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-ink">
            {labels.result}
            <select name="result" defaultValue={values.result} className={`mt-1 ${CONTROL}`}>
              <option value="">{labels.anyResult}</option>
              {resultCodes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          {labels.filter}
        </button>
        {filtered && (
          <Link
            href={`/admin/reports?report=${report}`}
            className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {labels.clear}
          </Link>
        )}
        {report === 'results' && values.exam !== '' && values.exam !== '0' && (
          <Link
            href={`/admin/monthly-exams/${values.exam}/marks?tab=results`}
            className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {labels.examOpen}
          </Link>
        )}
      </div>
    </form>
  );
}
