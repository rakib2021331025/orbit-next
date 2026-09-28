import type { Metadata } from 'next';
import { getLang, translate } from '@/lib/i18n';
import { GiftFormPage } from '../GiftFormPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'agift.create'),
    robots: { index: false, follow: false },
  };
}

/** Adding a gift, from admin/gifts.php?new=1. */
export default function NewGiftPage() {
  return <GiftFormPage giftId={0} />;
}
