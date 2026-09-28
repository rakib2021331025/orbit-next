import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLang, translate } from '@/lib/i18n';
import { PromotionFormPage } from '../../PromotionFormPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'pa.edit'),
    robots: { index: false, follow: false },
  };
}

/** Editing a promotion, from admin/promotions.php?edit=ID. */
export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  return <PromotionFormPage promotionId={Number(id)} />;
}
