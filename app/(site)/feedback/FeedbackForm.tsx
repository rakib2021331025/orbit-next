'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Textarea, FormActions } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { feedbackAction } from './actions';
import { emptyFeedbackState } from './state';
import { cn } from '@/lib/cn';

/**
 * The review form.
 *
 * The rating is a radio group styled as stars, not a row of clickable icons: a
 * real `<input type="radio">` per value means it works with the keyboard, is
 * announced properly by a screen reader, and submits without JavaScript.
 */
export function FeedbackForm({
  labels,
}: {
  labels: {
    name: string;
    course: string;
    coursePlaceholder: string;
    rating: string;
    stars: string;
    feedback: string;
    feedbackPlaceholder: string;
    submit: string;
    success: string;
  };
}) {
  const [state, formAction, pending] = useActionState(feedbackAction, emptyFeedbackState);
  const [rating, setRating] = useState(5);

  if (state.done) {
    return (
      <Alert tone="success" icon="bi-check-circle-fill">
        {labels.success}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fb-name" label={labels.name} required>
          <Input
            id="fb-name"
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            defaultValue={state.values.name}
          />
        </Field>

        <Field id="fb-course" label={labels.course} required>
          <Input
            id="fb-course"
            name="course_name"
            required
            maxLength={150}
            placeholder={labels.coursePlaceholder}
            defaultValue={state.values.course_name}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">{labels.rating}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="cursor-pointer"
              title={labels.stars.replace('{n}', String(value))}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                required
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              <i
                className={cn(
                  'bi text-2xl transition',
                  value <= rating ? 'bi-star-fill text-accent' : 'bi-star text-ink-muted/40'
                )}
                aria-hidden
              />
              <span className="sr-only">{labels.stars.replace('{n}', String(value))}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="fb-text" label={labels.feedback} required>
        <Textarea
          id="fb-text"
          name="feedback"
          required
          maxLength={2000}
          placeholder={labels.feedbackPlaceholder}
          defaultValue={state.values.feedback}
        />
      </Field>

      <FormActions>
        <Button type="submit" disabled={pending} icon="bi-send">
          {labels.submit}
        </Button>
      </FormActions>
    </form>
  );
}
