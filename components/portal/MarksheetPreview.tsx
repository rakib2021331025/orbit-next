import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { makeTranslator, type Lang, type Translator } from '@/lib/i18n';
import { instituteName } from '@/lib/settings';
import { signToken } from '@/lib/security/token';
import { absoluteUrl, whatsappUrl } from '@/lib/site/url';
import type { monthlyExam } from '@/lib/results/exam';

type Exam = NonNullable<Awaited<ReturnType<typeof monthlyExam>>>;

/** Share links last a week, as orbit_sign_token(…, 7 * 86400) does. */
const SHARE_TTL = 7 * 86_400;

/**
 * The marksheet page shared by student/marksheet.php and guardian/marksheet.php:
 * an A4 preview, print, PDF download, and "share on WhatsApp".
 *
 * The preview IS the PDF (served inline by /api/marksheet), so what a parent
 * sees on screen and what they download can never differ.
 *
 * The WhatsApp link carries a signed token rather than the portal URL: the
 * person it is sent to — a grandparent, a tutor — has no account, and the token
 * opens exactly this one marksheet for seven days and nothing else.
 */
export async function MarksheetPreview({
  exam,
  student,
  docLang,
  langHref,
  back,
  whatsappTo,
  t,
}: {
  exam: Exam;
  student: { id: number; name: string; name_bn?: string | null };
  /** The language the marksheet itself is printed in. */
  docLang: Lang;
  /** Builds this page's URL for a given document language. */
  langHref: (lang: Lang) => string;
  back: { href: string; label: string };
  /** A number to open the chat with directly; otherwise WhatsApp asks. */
  whatsappTo?: string | null;
  t: Translator;
}) {
  const doc = makeTranslator(docLang);
  const pdfBase = `/api/marksheet?exam=${exam.id}&student=${student.id}&lang=${docLang}`;

  const shareText = doc.t('ms.whatsapp_text', {
    name: doc.pick(student, 'name'),
    exam: doc.pick(exam, 'title'),
    month: doc.monthLabel(exam.exam_month),
    institute: await instituteName(docLang),
  });
  const token = signToken('marksheet', { e: exam.id, s: student.id, l: docLang }, SHARE_TTL);
  const message = `${shareText}\n${doc.t('ms.whatsapp_link')} ${absoluteUrl(`/marksheet-share?t=${encodeURIComponent(token)}`)}`;
  const waUrl = whatsappUrl(whatsappTo ?? '', message) || `https://wa.me/?text=${encodeURIComponent(message)}`;

  const button =
    'inline-flex items-center gap-1.5 rounded-orbit px-3 py-1.5 text-sm font-medium transition';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={back.href} className="text-sm font-medium text-primary hover:underline">
          &larr; {back.label}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex overflow-hidden rounded-orbit border border-line text-sm">
            {(['bn', 'en'] as const).map((lang) => (
              <Link
                key={lang}
                href={langHref(lang)}
                aria-current={lang === docLang ? 'true' : undefined}
                className={lang === docLang ? 'bg-primary px-3 py-1.5 text-white' : 'px-3 py-1.5 hover:bg-surface-2'}
              >
                {lang === 'bn' ? 'বাংলা' : 'English'}
              </Link>
            ))}
          </span>
          <a href={pdfBase} target="_blank" rel="noopener" className={`${button} border border-line hover:bg-surface-2`}>
            <i className="bi bi-printer" aria-hidden />
            {t.t('ms.print')}
          </a>
          <a href={`${pdfBase}&format=pdf`} className={`${button} bg-accent text-ink-heading`}>
            <i className="bi bi-file-earmark-pdf" aria-hidden />
            {t.t('ms.download_pdf')}
          </a>
          <a href={waUrl} target="_blank" rel="noopener" className={`${button} bg-green-600 text-white hover:bg-green-700`}>
            <i className="bi bi-whatsapp" aria-hidden />
            {t.t('ms.share_whatsapp')}
          </a>
        </div>
      </div>

      <Card className="overflow-hidden">
        <iframe
          src={pdfBase}
          title={`${doc.pick(exam, 'title')} — ${doc.pick(student, 'name')}`}
          className="h-[80vh] w-full border-0 bg-white"
        />
      </Card>
    </div>
  );
}
