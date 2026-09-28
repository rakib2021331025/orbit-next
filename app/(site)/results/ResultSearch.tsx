'use client';

import { useActionState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select, FormActions } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { searchResultsAction, type ResultSearchState } from './actions';
import { emptyResultSearch } from './state';

/**
 * The result search form and its answer.
 *
 * The phone digits are never given back to the form. Echoing them would put half
 * a credential into the rendered HTML, where it survives in the browser's
 * back-forward cache and in any screenshot the student shares.
 */
export function ResultSearch({
  exams,
  labels,
}: {
  exams: { id: number; label: string }[];
  labels: {
    title: string;
    sub: string;
    studentId: string;
    last4: string;
    last4Hint: string;
    exam: string;
    examAll: string;
    submit: string;
    again: string;
    privacy: string;
    noResults: string;
    noResultExam: string;
    foundFor: string;
    gpa: string;
    grade: string;
    position: string;
    total: string;
    marksheet: string;
    marksheetNote: string;
    incomplete: string;
    pass: string;
    fail: string;
  };
}) {
  const [state, formAction, pending] = useActionState(searchResultsAction, emptyResultSearch);

  if (state.found) {
    return <FoundCard state={state} labels={labels} />;
  }

  return (
    <Card>
      <CardHeader title={labels.title} subtitle={labels.sub} icon="bi-search" />
      <CardBody>
        <form action={formAction} className="space-y-4">
          {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="student_id" label={labels.studentId} required>
              <Input
                id="student_id"
                name="student_id"
                required
                autoComplete="off"
                defaultValue={state.studentId}
                placeholder="ORBIT-2026-0001"
              />
            </Field>

            <Field id="last4" label={labels.last4} hint={labels.last4Hint} required>
              <Input
                id="last4"
                name="last4"
                required
                inputMode="numeric"
                pattern="[0-9০-৯]{4}"
                maxLength={4}
                autoComplete="off"
              />
            </Field>
          </div>

          {exams.length > 0 && (
            <Field id="exam" label={labels.exam}>
              <Select id="exam" name="exam" defaultValue="0">
                <option value="0">{labels.examAll}</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <FormActions>
            <Button type="submit" disabled={pending} icon="bi-search">
              {labels.submit}
            </Button>
            <p className="text-xs text-ink-muted">{labels.privacy}</p>
          </FormActions>
        </form>
      </CardBody>
    </Card>
  );
}

function FoundCard({
  state,
  labels,
}: {
  state: ResultSearchState;
  labels: Parameters<typeof ResultSearch>[0]['labels'];
}) {
  const found = state.found!;

  return (
    <Card>
      <CardHeader
        title={labels.foundFor.replace('{name}', found.student.name)}
        icon="bi-award"
        subtitle={[found.student.studentIdNo, found.student.course, found.student.batch]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <a
            href="/results"
            className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {labels.again}
          </a>
        }
      />

      {found.results.length === 0 ? (
        <EmptyState icon="bi-journal-x" title={labels.noResults} body={labels.noResultExam} />
      ) : (
        <ul className="divide-y divide-line-soft">
          {found.results.map((result) => (
            <li key={result.examId} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-heading">{result.title}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">{result.month}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!result.complete ? (
                    <Badge tone="warning">{labels.incomplete}</Badge>
                  ) : result.passed ? (
                    <Badge tone="success">{labels.pass}</Badge>
                  ) : (
                    <Badge tone="danger">{labels.fail}</Badge>
                  )}
                </div>
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Stat label={labels.gpa} value={result.gpa === null ? '—' : result.gpa.toFixed(2)} />
                <Stat label={labels.grade} value={result.grade || '—'} />
                <Stat
                  label={labels.total}
                  value={`${result.totalObtained} / ${result.totalFull}`}
                />
                {result.hasPosition && result.position !== null && (
                  <Stat label={labels.position} value={String(result.position)} />
                )}
              </dl>

              {/* The marksheet link is signed and short-lived, so it is minted
                  per request rather than rendered as a permanent URL. */}
              <a
                href={`/api/marksheet?exam=${result.examId}&student=${found.student.id}`}
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <i className="bi bi-file-earmark-pdf" aria-hidden />
                {labels.marksheet}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-line-soft bg-surface-2 px-5 py-3 text-xs text-ink-muted">
        {labels.marksheetNote}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-head font-semibold tabular-nums text-ink-heading">{value}</dd>
    </div>
  );
}
