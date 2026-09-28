import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { ProgressView } from '@/components/portal/ProgressView';
import { getLang, translate } from '@/lib/i18n';
import { studentProgress } from '@/lib/results/progress';
import { studentAttendanceSummary, studentPaymentTotals } from '@/lib/student/data';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'prog.title_student'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student's own progress, from student/progress.php.
 *
 * The same `ProgressView` the guardian portal renders, so a parent and a student
 * looking at the same month never see different numbers.
 */
export default async function StudentProgressPage() {
  return (
    <StudentPage
      active="progress"
      title={(t) => t.t('prog.title_student')}
      subtitle={(t) => t.t('prog.sub_student')}
    >
      {async ({ student, t }) => {
        const [months, attendance, payments] = await Promise.all([
          studentProgress(student.id),
          studentAttendanceSummary(student.id),
          studentPaymentTotals(student.id),
        ]);

        return (
          <ProgressView
            months={months}
            attendance={attendance}
            payments={payments}
            t={t}
          />
        );
      }}
    </StudentPage>
  );
}
