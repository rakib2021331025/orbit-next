'use client';

import { useActionState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Field, Input, FormActions } from '@/components/ui/Form';
import { Button, ButtonLink } from '@/components/ui/Button';
import { checkStatusAction } from './actions';
import { emptyStatusState } from './state';

/**
 * The application-status form and its answer.
 *
 * The mobile number IS echoed back here, unlike the result lookup's four digits:
 * it is the applicant's own number, they typed it, and an application number
 * alone is not a credential without it.
 */
export function StatusLookup({
  labels,
  statusLabels,
}: {
  labels: {
    heading: string;
    sub: string;
    appNo: string;
    mobile: string;
    course: string;
    batch: string;
    studentId: string;
    submit: string;
    privacy: string;
    needHelp: string;
    submittedOn: string;
    applyNew: string;
    login: string;
  };
  statusLabels: Record<string, { text: string; tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }>;
}) {
  const [state, formAction, pending] = useActionState(checkStatusAction, emptyStatusState);

  if (state.found) {
    const found = state.found;
    const status = statusLabels[found.status] ?? { text: found.status, tone: 'neutral' as const };

    return (
      <Card>
        <CardHeader
          title={found.name}
          subtitle={`${found.applicationNo} · ${labels.submittedOn.replace('{date}', found.submittedAt)}`}
          icon="bi-file-earmark-text"
          actions={<Badge tone={status.tone}>{status.text}</Badge>}
        />
        <CardBody className="space-y-4">
          <Alert tone={status.tone === 'danger' ? 'danger' : status.tone === 'success' ? 'success' : 'info'}>
            {status.text}
          </Alert>

          <dl className="grid gap-3 sm:grid-cols-2">
            {found.course && <Row label={labels.course} value={found.course} />}
            {found.batch && <Row label={labels.batch} value={found.batch} />}
            {found.studentIdNo && <Row label={labels.studentId} value={found.studentIdNo} />}
          </dl>

          {found.reviewNote && (
            <Alert tone="warning" title={labels.needHelp}>
              {found.reviewNote}
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            {found.studentIdNo ? (
              <ButtonLink href="/student/login" variant="primary" icon="bi-box-arrow-in-right">
                {labels.login}
              </ButtonLink>
            ) : (
              <ButtonLink href="/apply" variant="secondary">
                {labels.applyNew}
              </ButtonLink>
            )}
            <ButtonLink href="/check-status" variant="ghost">
              {labels.heading}
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={labels.heading} subtitle={labels.sub} icon="bi-search" />
      <CardBody>
        <form action={formAction} className="space-y-4">
          {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="application_no" label={labels.appNo} required>
              <Input
                id="application_no"
                name="application_no"
                required
                autoComplete="off"
                defaultValue={state.appNo}
              />
            </Field>

            <Field id="mobile" label={labels.mobile} required>
              <Input
                id="mobile"
                name="mobile"
                type="tel"
                required
                inputMode="numeric"
                autoComplete="tel"
                defaultValue={state.mobile}
              />
            </Field>
          </div>

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}
