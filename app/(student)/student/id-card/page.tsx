import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { getLang, isLang, translate, makeTranslator } from '@/lib/i18n';
import { settingFlag } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'idc.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student's own ID card, from student/id_card.php — view, print, PDF.
 *
 * Read-only: nothing is recorded, and there is no card until the office has
 * issued a Student ID. The institute can switch the download off entirely
 * (`student_id_card_download` = 0), in which case cards are collected in person.
 */
export default async function StudentIdCardPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const docLang = isLang(params.lang) ? params.lang : await getLang();
  const enabled = await settingFlag('student_id_card_download', true);

  return (
    <StudentPage active="profile" title={(t) => t.t('idc.title')}>
      {({ student, t }) => {
        const back = (
          <Link href="/student/profile" className="text-sm font-medium text-primary hover:underline">
            &larr; {t.t('student.nav.profile')}
          </Link>
        );

        if (!enabled || (student.student_id_no ?? '').trim() === '') {
          return (
            <div className="space-y-4">
              {back}
              <Alert tone="info" icon="bi-info-circle-fill">
                {t.t(enabled ? 'idc.not_issued' : 'idc.disabled')}
              </Alert>
            </div>
          );
        }

        const doc = makeTranslator(docLang);
        const pdf = `/api/id-card?lang=${docLang}`;
        const button = 'inline-flex items-center gap-1.5 rounded-orbit px-3 py-1.5 text-sm font-medium transition';

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {back}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex overflow-hidden rounded-orbit border border-line text-sm">
                  {(['bn', 'en'] as const).map((lang) => (
                    <Link
                      key={lang}
                      href={`/student/id-card?lang=${lang}`}
                      aria-current={lang === docLang ? 'true' : undefined}
                      className={lang === docLang ? 'bg-primary px-3 py-1.5 text-white' : 'px-3 py-1.5 hover:bg-surface-2'}
                    >
                      {lang === 'bn' ? 'বাংলা' : 'English'}
                    </Link>
                  ))}
                </span>
                <a href={pdf} target="_blank" rel="noopener" className={`${button} border border-line hover:bg-surface-2`}>
                  <i className="bi bi-printer" aria-hidden />
                  {doc.t('idc.print')}
                </a>
                <a href={`${pdf}&format=pdf`} className={`${button} bg-accent text-ink-heading`}>
                  <i className="bi bi-file-earmark-pdf" aria-hidden />
                  {doc.t('idc.pdf')}
                </a>
              </div>
            </div>

            <Card className="overflow-hidden">
              <iframe src={pdf} title={doc.t('idc.title')} className="h-[75vh] w-full border-0 bg-white" />
            </Card>
          </div>
        );
      }}
    </StudentPage>
  );
}
