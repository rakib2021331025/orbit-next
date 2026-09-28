'use client';

import { useActionState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';

/**
 * The actions come from whichever portal renders this. The teacher's carry an
 * ownership lock so they can only mark their own exams; the admin's do not, so
 * an administrator can mark on behalf of any teacher — which is exactly what
 * admin/exam_evaluate.php exists for.
 */
export interface EvaluateState {
  error: string;
  message: string;
}

export type EvaluateAction = (
  state: EvaluateState,
  formData: FormData
) => Promise<EvaluateState>;

const EMPTY: EvaluateState = { error: '', message: '' };

export interface EvaluateQuestion {
  id: number;
  index: number;
  type: 'mcq' | 'cq';
  text: string;
  imageUrl: string;
  marks: number;
  /** The student's chosen option, for an MCQ. */
  chosen: string | null;
  correct: string | null;
  options: { key: string; text: string }[];
  /** The student's written answer, for a CQ. */
  answerText: string;
  awarded: number | null;
  comment: string;
  isCorrect: boolean | null;
}

/**
 * The marking screen.
 *
 * Only CQ questions get an input. MCQs are shown with their result but cannot be
 * changed, because they were graded automatically — letting a teacher overwrite
 * them would make the auto-grading advisory rather than authoritative.
 *
 * Two buttons, and the difference matters: **save draft** keeps the marks without
 * telling the student anything; **finish** marks the attempt evaluated and sends
 * the notification. A teacher part-way through a class set should not be
 * notifying students each time they pause.
 */
export function EvaluateForm({
  action,
  attemptId,
  questions,
  overallComment,
  readOnly,
  labels,
}: {
  action: EvaluateAction;
  attemptId: number;
  questions: EvaluateQuestion[];
  overallComment: string;
  readOnly: boolean;
  labels: {
    questionNumber: string;
    mcqAuto: string;
    cqMarked: string;
    studentAnswer: string;
    typedAnswer: string;
    noAnswer: string;
    notAnswered: string;
    correct: string;
    wrong: string;
    marksMax: string;
    comment: string;
    commentPlaceholder: string;
    feedback: string;
    feedbackPlaceholder: string;
    saveDraft: string;
    finish: string;
    finishNote: string;
    figureAlt: string;
  };
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="attempt_id" value={attemptId} />

      {state.error !== '' && <Alert tone="danger">{state.error}</Alert>}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      {questions.map((question) => (
        <Card key={question.id}>
          <CardHeader
            title={labels.questionNumber.replace('{n}', String(question.index))}
            icon={question.type === 'mcq' ? 'bi-ui-radios' : 'bi-pencil'}
            actions={
              <Badge tone={question.type === 'mcq' ? 'neutral' : 'info'}>
                {question.type === 'mcq' ? labels.mcqAuto : labels.cqMarked}
              </Badge>
            }
          />
          <CardBody className="space-y-3">
            <p className="whitespace-pre-line text-ink">{question.text}</p>

            {question.imageUrl !== '' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={question.imageUrl}
                alt={labels.figureAlt}
                className="max-h-72 rounded-orbit border border-line-soft object-contain"
              />
            )}

            {question.type === 'mcq' ? (
              <div className="space-y-2">
                <ul className="space-y-1.5 text-sm">
                  {question.options.map((option) => {
                    const chosen = question.chosen === option.key;
                    const correct = question.correct === option.key;
                    return (
                      <li
                        key={option.key}
                        className={
                          correct
                            ? 'rounded-orbit bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : chosen
                              ? 'rounded-orbit bg-red-50 px-3 py-2 text-red-900 dark:bg-red-950/40 dark:text-red-200'
                              : 'px-3 py-2 text-ink'
                        }
                      >
                        <span className="me-2 font-semibold uppercase">{option.key}</span>
                        {option.text}
                      </li>
                    );
                  })}
                </ul>

                <p className="text-sm font-medium">
                  {question.chosen === null ? (
                    <span className="text-ink-muted">{labels.notAnswered}</span>
                  ) : question.isCorrect ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {labels.correct.replace('{marks}', String(question.awarded ?? question.marks))}
                    </span>
                  ) : (
                    <span className="text-red-700 dark:text-red-400">
                      {labels.wrong.replace('{marks}', String(question.awarded ?? 0))}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-orbit border border-line-soft bg-surface-2 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {labels.typedAnswer}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink">
                    {question.answerText.trim() !== '' ? (
                      question.answerText
                    ) : (
                      <span className="text-ink-muted">{labels.noAnswer}</span>
                    )}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">
                      {labels.marksMax.replace('{max}', String(question.marks))}
                    </span>
                    <input
                      type="number"
                      name={`marks[${question.id}]`}
                      defaultValue={question.awarded === null ? '' : String(question.awarded)}
                      min={0}
                      max={question.marks}
                      step="0.5"
                      readOnly={readOnly}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-ink read-only:bg-surface-2"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">{labels.comment}</span>
                    <textarea
                      name={`comments[${question.id}]`}
                      defaultValue={question.comment}
                      rows={2}
                      readOnly={readOnly}
                      placeholder={labels.commentPlaceholder}
                      className="rounded-orbit border border-line bg-surface px-3 py-2 text-ink read-only:bg-surface-2"
                    />
                  </label>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader title={labels.feedback} icon="bi-chat-left-text" />
        <CardBody className="space-y-4">
          <textarea
            name="teacher_comment"
            defaultValue={overallComment}
            rows={3}
            readOnly={readOnly}
            placeholder={labels.feedbackPlaceholder}
            className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-ink read-only:bg-surface-2"
          />

          {!readOnly && (
            <>
              <p className="text-xs text-ink-muted">{labels.finishNote}</p>
              <div className="flex flex-wrap gap-2">
                {/* Two submits, distinguished by the button's own value. */}
                <Button
                  type="submit"
                  name="action"
                  value="draft"
                  variant="secondary"
                  disabled={pending}
                  icon="bi-save"
                >
                  {labels.saveDraft}
                </Button>
                <Button
                  type="submit"
                  name="action"
                  value="finalise"
                  disabled={pending}
                  icon="bi-check2-circle"
                >
                  {labels.finish}
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </form>
  );
}
