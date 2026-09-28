import type { Metadata } from 'next';
import { GuardianPage } from '@/components/portal/GuardianPage';
import { ProgressView } from '@/components/portal/ProgressView';
import { getLang, translate } from '@/lib/i18n';
import { studentProgress } from '@/lib/results/progress';
import { studentAttendanceSummary, studentPaymentTotals } from '@/lib/student/data';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'prog.title_guardian'),
    robots: { index: false, follow: false },
  };
}

/**
 * A child's progress, from guardian/progress.php.
 *
 * The same `ProgressView` the student sees, for the child `GuardianPage`
 * resolved among this guardian's own — `?student=` of anybody else is a 404, so
 * a parent can never load another family's marks, attendance or fees here.
 */
export default async function GuardianProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const params = await searchParams;

  return (
    <GuardianPage
      active="progress"
      needsChild
      searchParams={params}
      title={(t) => t.t('prog.title_guardian')}
      subtitle={(t, child) => (child ? t.t('prog.sub_guardian', { name: t.pick(child, 'name') }) : '')}
    >
      {async ({ child, t }) => {
        if (!child) return null;
        const [months, attendance, payments] = await Promise.all([
          studentProgress(child.id),
          studentAttendanceSummary(child.id),
          studentPaymentTotals(child.id),
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
    </GuardianPage>
  );
}
