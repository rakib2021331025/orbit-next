import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLang, translate } from '@/lib/i18n';
import { GiftFormPage } from '../../GiftFormPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'agift.edit'),
    robots: { index: false, follow: false },
  };
}

/** Editing a gift, from admin/gifts.php?edit=ID. */
export default async function EditGiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  return <GiftFormPage giftId={Number(id)} />;
}
