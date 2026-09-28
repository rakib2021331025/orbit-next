import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody } from '@/components/ui/Card';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { GiftForm } from './GiftForms';

/** The gift form, shared by "add" and "edit" — the same fields either way. */
export async function GiftFormPage({ giftId }: { giftId: number }) {
  return (
    <AdminPage active="gifts" route="/admin/gifts" title="">
      {async ({ t }) => {
        const gift =
          giftId > 0 ? await prisma.gift.findUnique({ where: { id: giftId } }).catch(() => null) : null;
        if (giftId > 0 && !gift) notFound();

        return (
          <div className="space-y-6">
            <div>
              <Link href="/admin/gifts" className="text-sm text-primary hover:underline">
                <i className="bi bi-arrow-left me-1" aria-hidden /> {t.t('agift.back')}
              </Link>
              <h1 className="mt-1 text-2xl font-bold text-ink-heading">
                {t.t(gift ? 'agift.edit' : 'agift.create')}
              </h1>
            </div>

            <Card>
              <CardBody>
                <GiftForm
                  values={{
                    id: gift?.id ?? 0,
                    name: gift?.name ?? '',
                    nameBn: gift?.name_bn ?? '',
                    description: gift?.description ?? '',
                    descriptionBn: gift?.description_bn ?? '',
                    sortOrder: gift?.sort_order ?? 0,
                    // A new gift is active by default: it was added to be shown.
                    isActive: gift?.is_active ?? true,
                    imageUrl: gift?.image ? uploadUrl(gift.image) : '',
                  }}
                  labels={{
                    name: t.t('agift.name'),
                    nameBn: t.t('agift.name_bn'),
                    nameHint: t.t('agift.name_hint'),
                    description: t.t('agift.desc'),
                    descriptionBn: t.t('agift.desc_bn'),
                    order: t.t('agift.order'),
                    orderHint: t.t('agift.order_hint'),
                    active: t.t('agift.active'),
                    image: t.t('agift.image'),
                    imageHint: t.t('agift.image_hint'),
                    removeImage: t.t('agift.remove_image'),
                    preview: t.t('agift.preview'),
                    save: t.t('agift.save'),
                    saving: t.t('common.please_wait'),
                    back: t.t('agift.back'),
                    cancel: t.t('common.cancel'),
                  }}
                />
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
