import type { Metadata } from 'next';
import { getLang, translate } from '@/lib/i18n';
import { ExamFormPage } from '../ExamFormPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'mexam.create'),
    robots: { index: false, follow: false },
  };
}

/** Creating a monthly exam, from admin/monthly_exams.php?new=1. */
export default function NewMonthlyExamPage() {
  return <ExamFormPage examId={0} />;
}
