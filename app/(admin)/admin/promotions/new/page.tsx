import type { Metadata } from 'next';
import { getLang, translate } from '@/lib/i18n';
import { PromotionFormPage } from '../PromotionFormPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'pa.create'),
    robots: { index: false, follow: false },
  };
}

/** Creating a promotion, from admin/promotions.php?new=1. */
export default function NewPromotionPage() {
  return <PromotionFormPage promotionId={0} />;
}
