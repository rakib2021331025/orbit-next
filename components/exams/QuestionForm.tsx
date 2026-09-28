'use client';

import { useActionState, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea, FieldGrid, FormActions } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
/**
 * Actions are supplied by whichever portal renders this, because the admin and
 * teacher screens are the same view over different rules: the teacher's actions
 * carry an ownership lock, the admin's do not. The original shares its markup the
 * same way, through includes/exam_view.php and includes/evaluate_view.php.
 */
export interface ExamFormState {
  error: string;
  message: string;
}

export type ExamAction = (state: ExamFormState, formData: FormData) => Promise<ExamFormState>;

const EMPTY: ExamFormState = { error: '', message: '' };

export interface QuestionValues {
  id: number;
  question_type: string;
  question_text: string;
  marks: string;
  sort_order: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
}

/**
 * Adding or editing one question.
 *
 * The option fields and the answer key appear only for an MCQ. A CQ has no
 * options and no key — its marks come from a teacher reading the answer, which is
 * what the note under the type selector says.
 *
 * Options A and B are required; C and D are optional, because a true/false
 * question is a legitimate two-option MCQ.
 */
export function QuestionForm({
  action,
  examId,
  values,
  labels,
  onCancelHref,
}: {
  action: ExamAction;
  examId: number;
  values: QuestionValues;
  onCancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const [type, setType] = useState(values.question_type || 'mcq');
  const [correct, setCorrect] = useState(values.correct_option);

  const editing = values.id > 0;

  return (
    <Card>
      <CardHeader title={editing ? labels.edit : labels.add} icon="bi-patch-question" />
      <CardBody>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="exam_id" value={examId} />
          <input type="hidden" name="id" value={values.id} />

          {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
          {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

          <FieldGrid columns={3}>
            <Field id="question_type" label={labels.type} hint={labels.typeHint}>
              <Select
                id="question_type"
                name="question_type"
                value={type}
                onChange={(event) => setType(event.currentTarget.value)}
              >
                <option value="mcq">{labels.typeMcq}</option>
                <option value="cq">{labels.typeCq}</option>
              </Select>
            </Field>

            <Field id="marks" label={labels.marks} required>
              <Input
                id="marks"
                name="marks"
                type="number"
                min={0.5}
                max={999}
                step="0.5"
                required
                defaultValue={values.marks}
              />
            </Field>

            <Field id="sort_order" label={labels.order} hint={labels.orderHint}>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                min={0}
                defaultValue={values.sort_order}
              />
            </Field>
          </FieldGrid>

          <Field id="question_text" label={labels.text} required>
            <Textarea
              id="question_text"
              name="question_text"
              required
              rows={3}
              defaultValue={values.question_text}
              placeholder={labels.textPlaceholder}
            />
          </Field>

          {type === 'mcq' ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-ink">
                {labels.options}
                <span className="ms-2 text-xs font-normal text-ink-muted">
                  {labels.optionsHint}
                </span>
              </legend>

              {(['a', 'b', 'c', 'd'] as const).map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="flex shrink-0 items-center gap-1.5">
                    <input
                      type="radio"
                      name="correct_option"
                      value={key}
                      checked={correct === key}
                      onChange={() => setCorrect(key)}
                      className="h-4 w-4 border-line text-primary focus:ring-primary/30"
                      aria-label={labels.markCorrect.replace('{letter}', key.toUpperCase())}
                    />
                    <span className="w-4 font-semibold uppercase text-ink-muted">{key}</span>
                  </label>

                  <Input
                    name={`option_${key}`}
                    defaultValue={values[`option_${key}` as keyof QuestionValues] as string}
                    // A and B are required; C and D are optional, so a
                    // true/false question does not need four boxes filled.
                    required={key === 'a' || key === 'b'}
                    placeholder={
                      key === 'a' || key === 'b'
                        ? labels.optionPlaceholder.replace('{letter}', key.toUpperCase())
                        : labels.optionOptionalPlaceholder.replace('{letter}', key.toUpperCase())
                    }
                  />
                </div>
              ))}
            </fieldset>
          ) : (
            <Alert tone="info" icon="bi-info-circle">
              {labels.cqNote}
            </Alert>
          )}

          <FormActions>
            <Button type="submit" disabled={pending} icon="bi-save">
              {editing ? labels.update : labels.add}
            </Button>
            {editing && (
              <a
                href={onCancelHref}
                className="rounded-orbit border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                {labels.cancelEdit}
              </a>
            )}
          </FormActions>
        </form>
      </CardBody>
    </Card>
  );
}
