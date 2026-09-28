import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StudentPage } from '@/components/portal/StudentPage';
import { MarksheetPreview } from '@/components/portal/MarksheetPreview';
import { getLang, isLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { studentExamResult } from '@/lib/results/exam';
import { requireStudent } from '@/lib/auth/guards';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'ms.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student's own marksheet, from student/marksheet.php.
 *
 *   ?exam=<monthly exam id>[&lang=bn|en][&download=1]
 *
 * Only their own, and only for a PUBLISHED exam they have marks in. The
 * WhatsApp button opens the chat with the guardian's number when it is on file —
 * the person a marksheet is usually sent to.
 */
export default async function StudentMarksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; lang?: string; download?: string; format?: string }>;
}) {
  const params = await searchParams;
  const examId = /^\d+$/.test(params.exam ?? '') ? Number(params.exam) : 0;
  const docLang = isLang(params.lang) ? params.lang : await getLang();

  // Checked before rendering: a redirect thrown from inside StudentPage's render
  // callback surfaces as an unhandled rejection in the server log.
  const me = await requireStudent();
  const entry = examId > 0 ? await studentExamResult(examId, me.id) : null;
  if (!entry || entry.exam.status !== 'published' || !entry.result.hasMarks) {
    redirect('/student/results');
  }
  if (params.download || params.format === 'pdf') {
    redirect(`/api/marksheet?exam=${examId}&lang=${docLang}&format=pdf`);
  }

  return (
    <StudentPage active="results" title={(t) => t.t('ms.title')}>
      {async ({ student, t }) => {

        const record = await prisma.student
          .findUnique({ where: { id: student.id }, select: { guardian_phone: true } })
          .catch(() => null);

        return (
          <MarksheetPreview
            exam={entry.exam}
            student={student}
            docLang={docLang}
            langHref={(lang) => `/student/marksheet?exam=${examId}&lang=${lang}`}
            back={{ href: '/student/results', label: t.t('student.nav.results') }}
            whatsappTo={record?.guardian_phone ?? null}
            t={t}
          />
        );
      }}
    </StudentPage>
  );
}
