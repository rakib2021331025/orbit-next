'use client';

import { useActionState, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, FieldGrid, FormActions, Input, Select, Textarea } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
/**
 * The actions are supplied by whichever portal renders these, because the admin
 * and teacher screens are one view over two rule sets: the teacher's actions
 * carry an ownership lock and always schedule for themselves, the admin's do
 * neither. includes/live_class_view.php is shared between the two originals in
 * exactly the same way.
 */
export interface ClassFormState {
  error: string;
  message: string;
}

export type ClassAction = (state: ClassFormState, formData: FormData) => Promise<ClassFormState>;

const EMPTY: ClassFormState = { error: '', message: '' };

export interface ClassFormValues {
  id: number;
  subject: string;
  topic: string;
  course_id: string;
  batch_id: string;
  class_mode: string;
  class_date: string;
  start_time: string;
  duration_minutes: string;
  meet_url: string;
  description: string;
  status: string;
}

export interface CourseOption {
  id: number;
  name: string;
}

export interface BatchOption {
  id: number;
  name: string;
  course_id: number | null;
}

/**
 * Scheduling one class.
 *
 * The batch list follows the chosen course, because a batch belongs to exactly
 * one course and the pairing is what decides which students see the class. The
 * server refuses a mismatched pair anyway; narrowing the list here means a
 * teacher never meets that refusal.
 *
 * `'__keep'` appears only when the class being edited carries a course or batch
 * that is no longer in the tables. Keeping it selectable is what stops an edit
 * to an old class silently widening its audience to everyone.
 */
export function ClassForm({
  action,
  values,
  courses,
  batches,
  teachers,
  selectedTeacherId,
  branches,
  selectedBranchId,
  keepCourseLabel,
  keepBatchLabel,
  onCancelHref,
  labels,
}: {
  action: ClassAction;
  values: ClassFormValues;
  courses: CourseOption[];
  batches: BatchOption[];
  /**
   * Only the admin screen passes these. A teacher's class is always their own and
   * inherits its branch from the audience, so the fields are not rendered for
   * them at all rather than rendered and ignored.
   */
  teachers?: { id: number; name: string }[];
  selectedTeacherId?: number;
  branches?: { id: number; name: string }[];
  selectedBranchId?: number | null;
  keepCourseLabel: string;
  keepBatchLabel: string;
  onCancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const [course, setCourse] = useState(values.course_id);
  const [batch, setBatch] = useState(values.batch_id);

  const editing = values.id > 0;
  const courseId = /^\d+$/.test(course) ? Number(course) : 0;

  // With no course chosen, every batch is offered and the server takes that
  // batch's own course; with one chosen, only its batches are.
  const offered = courseId > 0 ? batches.filter((row) => row.course_id === courseId) : batches;

  return (
    <Card id="scheduleCard">
      <CardHeader
        title={editing ? labels.editTitle : labels.newTitle}
        icon="bi-camera-video"
        subtitle={labels.audienceHelp}
      />
      <CardBody>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="id" value={values.id} />

          {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
          {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

          <FieldGrid columns={2}>
            <Field id="subject" label={labels.subject} required>
              <Input
                id="subject"
                name="subject"
                required
                maxLength={150}
                defaultValue={values.subject}
                placeholder={labels.subjectPlaceholder}
              />
            </Field>

            <Field id="topic" label={labels.topic}>
              <Input
                id="topic"
                name="topic"
                maxLength={255}
                defaultValue={values.topic}
                placeholder={labels.topicPlaceholder}
              />
            </Field>
          </FieldGrid>

          {(teachers !== undefined || branches !== undefined) && (
            <FieldGrid columns={2}>
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

              {branches !== undefined && (
                <Field id="branch_id" label={labels.branch}>
                  <Select
                    id="branch_id"
                    name="branch_id"
                    defaultValue={selectedBranchId ? String(selectedBranchId) : ''}
                  >
                    {/* A class with no branch is shared by every branch. */}
                    <option value="">{labels.branchAll}</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </FieldGrid>
          )}

          <FieldGrid columns={2}>
            <Field id="course_id" label={labels.course} hint={labels.audienceHelp}>
              <Select
                id="course_id"
                name="course_id"
                value={course}
                onChange={(event) => {
                  setCourse(event.currentTarget.value);
                  // A batch of the old course would no longer be a valid pair.
                  setBatch('');
                }}
              >
                <option value="">{labels.courseAll}</option>
                {values.course_id === '__keep' && <option value="__keep">{keepCourseLabel}</option>}
                {courses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="batch_id" label={labels.batch}>
              <Select
                id="batch_id"
                name="batch_id"
                value={batch}
                onChange={(event) => setBatch(event.currentTarget.value)}
              >
                <option value="">{labels.batchAll}</option>
                {values.batch_id === '__keep' && <option value="__keep">{keepBatchLabel}</option>}
                {offered.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field id="class_date" label={labels.date} required>
              <Input
                id="class_date"
                name="class_date"
                type="date"
                required
                defaultValue={values.class_date}
              />
            </Field>

            <Field id="start_time" label={labels.startTime} required>
              <Input
                id="start_time"
                name="start_time"
                type="time"
                required
                defaultValue={values.start_time}
              />
            </Field>

            <Field id="duration_minutes" label={labels.duration} hint={labels.minutes} required>
              <Input
                id="duration_minutes"
                name="duration_minutes"
                type="number"
                min={5}
                max={600}
                required
                defaultValue={values.duration_minutes}
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field id="class_mode" label={labels.mode}>
              <Select id="class_mode" name="class_mode" defaultValue={values.class_mode}>
                <option value="online">{labels.modeOnline}</option>
                <option value="offline">{labels.modeOffline}</option>
              </Select>
            </Field>

            <Field id="status" label={labels.status}>
              <Select id="status" name="status" defaultValue={values.status}>
                <option value="scheduled">{labels.statusScheduled}</option>
                <option value="completed">{labels.statusCompleted}</option>
                <option value="cancelled">{labels.statusCancelled}</option>
              </Select>
            </Field>

            <Field id="meet_url" label={labels.meetUrl} hint={labels.meetHelp}>
              <Input
                id="meet_url"
                name="meet_url"
                type="url"
                maxLength={500}
                defaultValue={values.meet_url}
                placeholder="https://meet.google.com/…"
              />
            </Field>
          </FieldGrid>

          <Field id="description" label={labels.description}>
            <Textarea
              id="description"
              name="description"
              rows={3}
              maxLength={5000}
              defaultValue={values.description}
              placeholder={labels.descriptionPlaceholder}
            />
          </Field>

          <FormActions>
            <Button type="submit" disabled={pending} icon="bi-save">
              {editing ? labels.saveEdit : labels.saveNew}
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
