'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { saveAnswerAction, submitExamAction } from './actions';

export interface RunnerQuestion {
  id: number;
  type: 'mcq' | 'cq';
  text: string;
  marks: number;
  imageUrl: string;
  options: { key: 'a' | 'b' | 'c' | 'd'; text: string }[];
  answeredOption: 'a' | 'b' | 'c' | 'd' | null;
  answeredText: string;
}

export interface RunnerLabels {
  question: string;
  marks: string;
  yourAnswer: string;
  yourAnswerPlain: string;
  answerPlaceholder: string;
  clear: string;
  answered: string;
  notAnswered: string;
  saving: string;
  saved: string;
  notSaved: string;
  offline: string;
  timeLeft: string;
  timeUp: string;
  autoSubmitting: string;
  submit: string;
  submitting: string;
  confirmTitle: string;
  confirmBody: string;
  unanswered: string;
  yesSubmit: string;
  keepWorking: string;
  close: string;
  goTo: string;
  figureAlt: string;
  negative: string;
}

/**
 * Sitting an exam: the timer, the questions, autosave and submit.
 *
 * The three behaviours that matter, and why each is built this way:
 *
 *   - **The timer is seeded from the server** and counts down locally. It is a
 *     display, not the authority: every save and the submit re-check the deadline
 *     on the server, so changing the clock or the DOM buys nothing.
 *   - **Answers save on a debounce**, 800 ms after typing stops, and immediately
 *     on an MCQ choice. Saving on every keystroke would be one request per
 *     character on a slow connection.
 *   - **Time-up submits automatically**, once. A student who walks away still gets
 *     their MCQ marks.
 */
export function ExamRunner({
  examId,
  questions,
  initialSeconds,
  negativeMarking,
  resultHref,
  labels,
}: {
  examId: number;
  questions: RunnerQuestion[];
  initialSeconds: number;
  negativeMarking: number;
  resultHref: string;
  labels: RunnerLabels;
}) {
  const router = useRouter();

  const [seconds, setSeconds] = useState(initialSeconds);
  const [answers, setAnswers] = useState<Record<number, { option: string | null; text: string }>>(
    () =>
      Object.fromEntries(
        questions.map((question) => [
          question.id,
          { option: question.answeredOption, text: question.answeredText },
        ])
      )
  );
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(initialSeconds <= 0);

  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // A ref, not state: the auto-submit must fire exactly once, and a state update
  // would not be visible to the interval callback that is already running.
  const submitted = useRef(false);

  const finish = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    await submitExamAction(examId);
    router.replace(resultHref);
  }, [examId, resultHref, router]);

  // The countdown.
  useEffect(() => {
    if (expired) return;
    const tick = setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          clearInterval(tick);
          setExpired(true);
          void finish();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [expired, finish]);

  // Leaving with unsaved work should warn — but not once the exam is submitted.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (submitted.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const save = useCallback(
    async (questionId: number, value: { option?: string | null; text?: string | null }) => {
      setSaveState('saving');
      const result = await saveAnswerAction(examId, questionId, value);
      if (!result.ok && result.message === 'oex.take_expired_msg') {
        setExpired(true);
        void finish();
        return;
      }
      setSaveState(result.ok ? 'saved' : 'error');
    },
    [examId, finish]
  );

  const chooseOption = (questionId: number, option: string) => {
    setAnswers((current) => ({ ...current, [questionId]: { ...current[questionId], option } }));
    void save(questionId, { option });
  };

  const writeText = (questionId: number, text: string) => {
    setAnswers((current) => ({ ...current, [questionId]: { ...current[questionId], text } }));
    clearTimeout(timers.current[questionId]);
    // 800 ms after typing stops, not on every keystroke.
    timers.current[questionId] = setTimeout(() => void save(questionId, { text }), 800);
  };

  const clearAnswer = (questionId: number) => {
    setAnswers((current) => ({ ...current, [questionId]: { option: null, text: '' } }));
    void save(questionId, { option: null, text: '' });
  };

  const answeredCount = questions.filter((question) => {
    const answer = answers[question.id];
    return question.type === 'mcq' ? answer?.option : (answer?.text ?? '').trim() !== '';
  }).length;
  const unanswered = questions.length - answeredCount;

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const low = seconds <= 120;

  return (
    <div className="space-y-5">
      {/* The timer bar stays in view while scrolling: the student needs it. */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-orbit border border-line bg-surface px-4 py-3 shadow-orbit">
        <span
          className={cn(
            'inline-flex items-center gap-2 font-head text-lg font-semibold tabular-nums',
            low ? 'text-red-600' : 'text-ink-heading'
          )}
          role="timer"
          aria-live="off"
        >
          <i className="bi bi-clock-history" aria-hidden />
          {expired ? labels.timeUp : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`}
        </span>
        <span className="text-xs text-ink-muted">{labels.timeLeft}</span>

        <span className="ms-auto flex items-center gap-3 text-xs">
          <span className="text-ink-muted">
            {answeredCount} / {questions.length} {labels.answered}
          </span>
          {/* aria-live so a screen reader hears the save state without focus. */}
          <span aria-live="polite" className="min-w-20">
            {saveState === 'saving' && <span className="text-ink-muted">{labels.saving}</span>}
            {saveState === 'saved' && <span className="text-emerald-600">{labels.saved}</span>}
            {saveState === 'error' && <span className="text-red-600">{labels.notSaved}</span>}
          </span>
        </span>
      </div>

      {expired && (
        <Alert tone="warning" icon="bi-hourglass-bottom">
          {labels.autoSubmitting}
        </Alert>
      )}

      {negativeMarking > 0 && (
        <Alert tone="info" icon="bi-info-circle">
          {labels.negative}
        </Alert>
      )}

      {questions.map((question, index) => {
        const answer = answers[question.id] ?? { option: null, text: '' };
        const done =
          question.type === 'mcq' ? Boolean(answer.option) : answer.text.trim() !== '';

        return (
          <Card key={question.id} id={`q${question.id}`}>
            <CardHeader
              title={`${labels.question.replace('{n}', String(index + 1))}`}
              icon={question.type === 'mcq' ? 'bi-ui-radios' : 'bi-pencil'}
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">
                    {question.marks} {labels.marks}
                  </Badge>
                  <Badge tone={done ? 'success' : 'warning'}>
                    {done ? labels.answered : labels.notAnswered}
                  </Badge>
                </div>
              }
            />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-line text-ink">{question.text}</p>

              {question.imageUrl !== '' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={question.imageUrl}
                  alt={labels.figureAlt}
                  className="max-h-80 rounded-orbit border border-line-soft object-contain"
                />
              )}

              {question.type === 'mcq' ? (
                <ul className="space-y-2">
                  {question.options.map((option) => (
                    <li key={option.key}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-orbit border p-3 text-sm transition',
                          answer.option === option.key
                            ? 'border-primary bg-primary-soft'
                            : 'border-line bg-surface hover:bg-surface-2'
                        )}
                      >
                        <input
                          type="radio"
                          name={`q${question.id}`}
                          value={option.key}
                          checked={answer.option === option.key}
                          onChange={() => chooseOption(question.id, option.key)}
                          disabled={expired || submitting}
                          className="mt-0.5 h-4 w-4 border-line text-primary focus:ring-primary/30"
                        />
                        <span>
                          <span className="me-2 font-semibold uppercase text-ink-muted">
                            {option.key}
                          </span>
                          {option.text}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>
                  <label
                    htmlFor={`answer-${question.id}`}
                    className="mb-1.5 block text-sm font-medium text-ink"
                  >
                    {labels.yourAnswer}
                  </label>
                  <textarea
                    id={`answer-${question.id}`}
                    value={answer.text}
                    onChange={(event) => writeText(question.id, event.currentTarget.value)}
                    disabled={expired || submitting}
                    rows={6}
                    placeholder={labels.answerPlaceholder}
                    className="w-full rounded-orbit border border-line bg-surface px-4 py-2.5 text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-surface-2"
                  />
                </div>
              )}

              {done && !expired && (
                <button
                  type="button"
                  onClick={() => clearAnswer(question.id)}
                  className="text-xs font-medium text-ink-muted transition hover:text-red-600"
                >
                  {labels.clear}
                </button>
              )}
            </CardBody>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-orbit border border-line bg-surface p-4">
        <p className="text-sm text-ink-muted">
          {unanswered > 0
            ? labels.unanswered.replace('{count}', String(unanswered))
            : `${answeredCount} / ${questions.length}`}
        </p>
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={expired || submitting}
          icon="bi-send"
        >
          {submitting ? labels.submitting : labels.submit}
        </Button>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={labels.confirmTitle}
        size="sm"
        closeLabel={labels.close}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {labels.keepWorking}
            </Button>
            <Button onClick={() => void finish()} disabled={submitting}>
              {labels.yesSubmit}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">{labels.confirmBody}</p>
        {unanswered > 0 && (
          <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            {labels.unanswered.replace('{count}', String(unanswered))}
          </p>
        )}
      </Modal>
    </div>
  );
}
