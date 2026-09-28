'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea, FormActions } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { inquiryAction } from '@/app/(site)/inquiry/actions';
import { emptyInquiryState } from '@/lib/site/inquiry-form';

/**
 * The "call me back" form, used on its own page and inline elsewhere.
 *
 * Two fields are not for the visitor:
 *
 *   - `form_token` is a signed timestamp minted on the server when the form was
 *     rendered. A bot that posts without fetching the form has none, and one that
 *     fills it in under three seconds is rejected.
 *   - the honeypot is positioned off-screen and marked `aria-hidden` with
 *     `tabIndex={-1}`, so neither a sighted user, a screen reader nor the keyboard
 *     ever reaches it. `display: none` is avoided because some bots skip hidden
 *     fields, which would defeat the point.
 */
export function InquiryForm({
  formToken,
  honeypotField,
  courses,
  source = 'page',
  defaultCourseId,
  labels,
}: {
  formToken: string;
  honeypotField: string;
  courses: { id: number; name: string }[];
  source?: string;
  defaultCourseId?: number;
  labels: {
    name: string;
    namePlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    course: string;
    courseNone: string;
    time: string;
    times: { value: string; label: string }[];
    message: string;
    messagePlaceholder: string;
    optional: string;
    submit: string;
    privacy: string;
    honeypot: string;
    errorSummary: string;
    doneTitle: string;
    doneText: string;
    doneAgain: string;
  };
}) {
  const [state, formAction, pending] = useActionState(inquiryAction, emptyInquiryState);

  // 'spam' is reported as success on purpose: telling a bot it was caught only
  // helps whoever wrote it.
  if (state.result === 'created' || state.result === 'updated' || state.result === 'spam') {
    return (
      <Alert tone="success" title={labels.doneTitle.replace('{name}', state.old.name)}>
        <p>{labels.doneText.replace('{phone}', state.old.phone)}</p>
        <a href="/inquiry" className="mt-2 inline-block font-medium underline">
          {labels.doneAgain}
        </a>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="form_token" value={formToken} />
      <input type="hidden" name="source" value={source} />

      {state.general !== '' && <Alert tone="danger">{state.general}</Alert>}
      {Object.keys(state.errors).length > 0 && <Alert tone="danger">{labels.errorSummary}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="inq-name" label={labels.name} error={state.errors.name} required>
          <Input
            id="inq-name"
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            placeholder={labels.namePlaceholder}
            defaultValue={state.old.name}
            error={Boolean(state.errors.name)}
          />
        </Field>

        <Field id="inq-phone" label={labels.phone} error={state.errors.phone} required>
          <Input
            id="inq-phone"
            name="phone"
            type="tel"
            required
            inputMode="numeric"
            autoComplete="tel"
            placeholder={labels.phonePlaceholder}
            defaultValue={state.old.phone}
            error={Boolean(state.errors.phone)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="inq-course" label={labels.course} error={state.errors.course_id}>
          <Select
            id="inq-course"
            name="course_id"
            defaultValue={String(defaultCourseId ?? state.old.course_id ?? 0)}
            error={Boolean(state.errors.course_id)}
          >
            <option value="0">{labels.courseNone}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="inq-time" label={labels.time}>
          <Select id="inq-time" name="preferred_time" defaultValue={state.old.preferred_time}>
            {labels.times.map((time) => (
              <option key={time.value} value={time.value}>
                {time.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        id="inq-message"
        label={`${labels.message} ${labels.optional}`}
        error={state.errors.message}
      >
        <Textarea
          id="inq-message"
          name="message"
          maxLength={500}
          placeholder={labels.messagePlaceholder}
          defaultValue={state.old.message}
          error={Boolean(state.errors.message)}
        />
      </Field>

      {/* Honeypot: off-screen rather than display:none, and unreachable by
          keyboard or screen reader. */}
      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="inq-hp">{labels.honeypot}</label>
        <input id="inq-hp" type="text" name={honeypotField} tabIndex={-1} autoComplete="off" />
      </div>

      <FormActions>
        <Button type="submit" disabled={pending} icon="bi-telephone-outbound">
          {pending ? '…' : labels.submit}
        </Button>
        <p className="text-xs text-ink-muted">{labels.privacy}</p>
      </FormActions>
    </form>
  );
}
