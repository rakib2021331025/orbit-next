'use client';

import { useActionState, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea, Checkbox, FieldGrid, FormActions } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';

/**
 * The action this form posts to, supplied by whichever portal renders it.
 *
 * The admin and teacher screens are the same form over different rules — the
 * teacher's action passes their id as an ownership lock, the admin's does not —
 * which is exactly how the original shares includes/exam_view.php between
 * admin/exams_management.php and teacher/exams.php.
 */
export interface ExamFormState {
  error: string;
  message: string;
}

export type ExamAction = (state: ExamFormState, formData: FormData) => Promise<ExamFormState>;

const EMPTY: ExamFormState = { error: '', message: '' };

export interface ExamFormValues {
  id: number;
  title: string;
  exam_type: string;
  subject: string;
  course: string;
  batch: string;
  instructions: string;
  pass_marks: string;
  duration_minutes: string;
  start_datetime: string;
  end_datetime: string;
  negative_marking: string;
  allow_file_upload: boolean;
  status: string;
}

/**
 * Creating or editing an exam.
 *
 * **A batch cannot be set without a course.** A batch name on its own would
 * address every course that happens to have a batch with that name — the same
 * leak the student-side audience scope is shaped to prevent — so the batch field
 * is disabled until a course is chosen, and the server refuses it too.
 *
 * Negative marking only applies to MCQs, so the field is hidden for a CQ-only
 * paper rather than offered and ignored.
 */
export function ExamForm({
  action,
  values,
  courses,
  batchesByCourse,
  teachers,
  selectedTeacherId,
  labels,
  onCancelHref,
}: {
  action: ExamAction;
  values: ExamFormValues;
  courses: string[];
  batchesByCourse: Record<string, string[]>;
  /**
   * Only the admin screen passes these: an administrator assigns the exam to a
   * teacher, while a teacher's own exam is always theirs and the library sets it
   * from the lock. When the list is absent the field is not rendered at all.
   */
  teachers?: { id: number; name: string }[];
  selectedTeacherId?: number;
  onCancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  const [examType, setExamType] = useState(values.exam_type || 'mcq');
  const [course, setCourse] = useState(values.course);

  const batches = course === '' ? [] : (batchesByCourse[course] ?? []);
  const editing = values.id > 0;

  return (
    <Card>
      <CardHeader
        title={editing ? labels.editTitle : labels.newTitle}
        icon="bi-journal-plus"
      />
      <CardBody>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="id" value={values.id} />

          {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
          {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

          <FieldGrid>
            <Field id="title" label={labels.title} required className="sm:col-span-2">
              <Input
                id="title"
                name="title"
                required
                maxLength={255}
                defaultValue={values.title}
                placeholder={labels.titlePlaceholder}
              />
            </Field>

            <Field id="subject" label={labels.subject} required>
              <Input id="subject" name="subject" required maxLength={150} defaultValue={values.subject} />
            </Field>

            <Field id="exam_type" label={labels.type} required>
              <Select
                id="exam_type"
                name="exam_type"
                value={examType}
                onChange={(event) => setExamType(event.currentTarget.value)}
              >
                <option value="mcq">{labels.typeMcq}</option>
                <option value="cq">{labels.typeCq}</option>
                <option value="mixed">{labels.typeMixed}</option>
              </Select>
            </Field>
          </FieldGrid>

          <FieldGrid>
            <Field id="course" label={labels.course} hint={labels.audienceHint}>
              <Select
                id="course"
                name="course"
                value={course}
                onChange={(event) => setCourse(event.currentTarget.value)}
              >
                <option value="">{labels.anyCourse}</option>
                {courses.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="batch" label={labels.batch}>
              <Select
                id="batch"
                name="batch"
                defaultValue={values.batch}
                // A batch without a course would widen the audience across
                // every course with a batch of that name.
                disabled={course === ''}
              >
                <option value="">{labels.anyBatch}</option>
                {batches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field id="start_datetime" label={labels.starts} required>
              <Input
                id="start_datetime"
                name="start_datetime"
                type="datetime-local"
                required
                defaultValue={values.start_datetime}
              />
            </Field>

            <Field id="end_datetime" label={labels.ends} hint={labels.endsHint} required>
              <Input
                id="end_datetime"
                name="end_datetime"
                type="datetime-local"
                required
                defaultValue={values.end_datetime}
              />
            </Field>

            <Field id="duration_minutes" label={labels.duration} hint={labels.durationHint} required>
              <Input
                id="duration_minutes"
                name="duration_minutes"
                type="number"
                min={1}
                max={600}
                required
                defaultValue={values.duration_minutes}
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field id="pass_marks" label={labels.passMarks}>
              <Input
                id="pass_marks"
                name="pass_marks"
                type="number"
                min={0}
                max={9999}
                step="0.5"
                defaultValue={values.pass_marks}
              />
            </Field>

            {/* Negative marking is an MCQ concept only. */}
            {examType !== 'cq' && (
              <Field id="negative_marking" label={labels.negative} hint={labels.negativeHint}>
                <Input
                  id="negative_marking"
                  name="negative_marking"
                  type="number"
                  min={0}
                  max={10}
                  step="0.25"
                  defaultValue={values.negative_marking}
                />
              </Field>
            )}

            {teachers !== undefined && (
              <Field id="teacher_id" label={labels.teacher}>
                <Select
                  id="teacher_id"
                  name="teacher_id"
                  defaultValue={String(selectedTeacherId ?? 0)}
                >
                  <option value="0">{labels.teacherNone}</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field id="status" label={labels.status}>
              <Select id="status" name="status" defaultValue={values.status || 'draft'}>
                <option value="draft">{labels.statusDraft}</option>
                <option value="published">{labels.statusPublished}</option>
                <option value="cancelled">{labels.statusCancelled}</option>
              </Select>
            </Field>
          </FieldGrid>

          <Field id="instructions" label={labels.instructions}>
            <Textarea
              id="instructions"
              name="instructions"
              maxLength={5000}
              defaultValue={values.instructions}
              placeholder={labels.instructionsPlaceholder}
            />
          </Field>

          {examType !== 'mcq' && (
            <Checkbox
              name="allow_file_upload"
              value="1"
              defaultChecked={values.allow_file_upload}
              label={labels.allowUpload}
            />
          )}

          <FormActions>
            <Button type="submit" disabled={pending} icon="bi-save">
              {editing ? labels.update : labels.create}
            </Button>
            <a
              href={onCancelHref}
              className="rounded-orbit border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-2"
            >
              {labels.cancel}
            </a>
          </FormActions>
        </form>
      </CardBody>
    </Card>
  );
}
