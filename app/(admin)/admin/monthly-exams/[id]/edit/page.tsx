import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLang, translate } from '@/lib/i18n';
import { ExamFormPage } from '../../ExamFormPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'mexam.edit'),
    robots: { index: false, follow: false },
  };
}

/** Exam settings, from admin/monthly_exams.php?edit=ID. */
export default async function EditMonthlyExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  return <ExamFormPage examId={Number(id)} />;
}
