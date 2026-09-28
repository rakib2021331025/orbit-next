'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { startExamAction } from './actions';

/**
 * The button that starts the timer.
 *
 * A deliberate, explicit action rather than something that happens on page load:
 * the countdown begins when the student says they are ready, not when a link was
 * followed by accident.
 */
export function StartExam({
  examId,
  label,
  backLabel,
}: {
  examId: number;
  label: string;
  backLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setPending(true);
    const result = await startExamAction(examId);
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    // Re-render the same URL, which now finds a running attempt.
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error !== '' && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={start} disabled={pending} size="lg" icon="bi-play-fill">
          {label}
        </Button>
        <Link href="/student/exams" className="text-sm font-medium text-ink-muted hover:text-primary">
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
