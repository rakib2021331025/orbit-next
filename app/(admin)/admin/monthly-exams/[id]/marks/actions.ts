'use server';

import { revalidatePath } from 'next/cache';
import { invalidate, TAGS } from '@/lib/cache';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { prisma } from '@/lib/db/prisma';
import { mailIsConfigured } from '@/lib/email/send';
import { publishExam, saveMarks, unpublishExam } from '@/lib/exams/marks';

/**
 * Marks, publishing and marksheet emails for one exam, from the POST half of
 * admin/monthly_exam_marks.php.
 */

export interface MarksState {
  error: string;
  message: string;
  /** The "some values were not saved" warning, which is not a failure. */
  warning: string;
}

function refresh(examId: number): void {
  revalidatePath(`/admin/monthly-exams/${examId}/marks`);
  revalidatePath('/admin/monthly-exams');
  revalidatePath('/admin/reports');
  invalidate(TAGS.exams, TAGS.stats);
  revalidatePath('/student/results');
  revalidatePath('/results');
}

export async function saveMarksAction(
  _prev: MarksState,
  formData: FormData
): Promise<MarksState> {
  const admin = await requireSuperAdmin();
  const lang = await getLang();
  const examId = Number(formData.get('id') ?? 0);

  // The grid posts as marks[<student>][<exam subject>].
  const grid = new Map<number, Map<number, string>>();
  for (const [name, value] of formData.entries()) {
    const match = /^marks\[(\d+)\]\[(\d+)\]$/.exec(name);
    if (!match) continue;
    const studentId = Number(match[1]);
    const subjectId = Number(match[2]);
    if (!grid.has(studentId)) grid.set(studentId, new Map());
    grid.get(studentId)!.set(subjectId, String(value));
  }

  const outcome = await saveMarks(examId, grid, admin.id);
  if (outcome.failed) return { error: translate(lang, 'error.generic'), message: '', warning: '' };

  refresh(examId);

  let warning = '';
  if (outcome.errors.length > 0) {
    // The names make the warning useful: "3 values were not saved" on its own
    // leaves somebody hunting the grid.
    const names = new Map(
      (
        await prisma.student
          .findMany({
            where: { id: { in: outcome.errors.map((error) => error.studentId) } },
            select: { id: true, name: true },
          })
          .catch(() => [])
      ).map((student) => [student.id, student.name])
    );

    const items = outcome.errors
      .slice(0, 6)
      .map((error) =>
        translate(lang, 'mexam.marks_invalid_item', {
          name: names.get(error.studentId) ?? `#${error.studentId}`,
          subject: error.subject,
          value: error.value,
        })
      );

    warning = translate(lang, 'mexam.marks_invalid', {
      count: toLocalDigits(outcome.errors.length, lang),
      items: items.join('; '),
    });
  }

  return {
    error: '',
    message: translate(lang, 'mexam.marks_saved', {
      saved: toLocalDigits(outcome.saved, lang),
      cleared: toLocalDigits(outcome.cleared, lang),
    }),
    warning,
  };
}

export async function publishAction(_prev: MarksState, formData: FormData): Promise<MarksState> {
  const admin = await requireSuperAdmin();
  const lang = await getLang();
  const examId = Number(formData.get('id') ?? 0);

  const outcome = await publishExam(
    examId,
    {
      portal: formData.get('notify_portal') !== null,
      // Email cannot be sent at all when the mailer is not set up, whatever the
      // box says.
      email: formData.get('notify_email') !== null && mailIsConfigured(),
    },
    admin.id
  );

  if (!outcome.ok) return { error: translate(lang, 'error.generic'), message: '', warning: '' };

  refresh(examId);
  return {
    error: '',
    message: translate(lang, 'mexam.published_notified', {
      notified: toLocalDigits(outcome.notified, lang),
      emailed: toLocalDigits(outcome.emailed, lang),
    }),
    warning:
      outcome.failed > 0
        ? translate(lang, 'mexam.email_failures', { count: toLocalDigits(outcome.failed, lang) })
        : '',
  };
}

export async function unpublishAction(_prev: MarksState, formData: FormData): Promise<MarksState> {
  await requireSuperAdmin();
  const lang = await getLang();
  const examId = Number(formData.get('id') ?? 0);

  if (!(await unpublishExam(examId))) {
    return { error: translate(lang, 'error.generic'), message: '', warning: '' };
  }

  refresh(examId);
  return { error: '', message: translate(lang, 'mexam.unpublished'), warning: '' };
}
