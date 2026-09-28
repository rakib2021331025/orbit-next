import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireGuardian, requireGuardianChild, NotFoundError, type GuardianChild } from '@/lib/auth/guards';
import { GuardianPage } from '@/components/portal/GuardianPage';
import { MarksheetPreview } from '@/components/portal/MarksheetPreview';
import { getLang, isLang, translate } from '@/lib/i18n';
import { studentExamResult } from '@/lib/results/exam';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'ms.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * A child's marksheet, from guardian/marksheet.php.
 *
 *   ?student=<linked child>&exam=<monthly exam id>[&lang=bn|en][&download=1]
 *
 * Only for a child linked to this guardian (anything else is a 404 from
 * `GuardianPage`) and only for a PUBLISHED exam the child has marks in —
 * otherwise back to the results list, as the original redirects with a flash.
 */
export default async function GuardianMarksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; exam?: string; lang?: string; download?: string; format?: string }>;
}) {
  const params = await searchParams;
  const examId = /^\d+$/.test(params.exam ?? '') ? Number(params.exam) : 0;
  const docLang = isLang(params.lang) ? params.lang : await getLang();

  // Resolved and checked before rendering: a redirect thrown from inside
  // GuardianPage's render callback surfaces as an unhandled rejection in the log.
  // The child still comes only from this guardian's own children (404 otherwise).
  const guardian = await requireGuardian();
  let child: GuardianChild | null;
  try {
    child = (await requireGuardianChild(guardian.id, params.student)).child;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  if (!child) redirect('/guardian');

  const entry = examId > 0 ? await studentExamResult(examId, child.id) : null;
  if (!entry || entry.exam.status !== 'published' || !entry.result.hasMarks) {
    redirect(`/guardian/results?student=${child.id}`);
  }
  if (params.download || params.format === 'pdf') {
    redirect(`/api/marksheet?exam=${examId}&student=${child.id}&lang=${docLang}&format=pdf`);
  }
  const chosen = child;

  return (
    <GuardianPage
      active="results"
      needsChild
      searchParams={params}
      switchTo="/guardian/results"
      title={(t) => t.t('ms.title')}
    >
      {({ t }) => {
        const child = chosen;
        return (
          <MarksheetPreview
            exam={entry.exam}
            student={child}
            docLang={docLang}
            langHref={(lang) => `/guardian/marksheet?student=${child.id}&exam=${examId}&lang=${lang}`}
            back={{ href: `/guardian/results?student=${child.id}`, label: t.t('guardian.nav.results') }}
            t={t}
          />
        );
      }}
    </GuardianPage>
  );
}
