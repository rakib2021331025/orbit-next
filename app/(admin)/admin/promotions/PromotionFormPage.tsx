import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody } from '@/components/ui/Card';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { PROMOTION_POSITIONS, PROMOTION_STYLES } from '@/lib/promotions/options';
import { PromotionForm } from './PromotionForms';

/** A Date as a `datetime-local` value, in the server's own clock. */
function localValue(date: Date | null): string {
  if (date === null) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The promotion form, shared by "new" and "edit". */
export async function PromotionFormPage({ promotionId }: { promotionId: number }) {
  return (
    <AdminPage active="promotions" route="/admin/promotions" title="">
      {async ({ t }) => {
        const promotion =
          promotionId > 0
            ? await prisma.promotion.findUnique({ where: { id: promotionId } }).catch(() => null)
            : null;
        if (promotionId > 0 && !promotion) notFound();

        return (
          <div className="space-y-6">
            <div>
              <Link href="/admin/promotions" className="text-sm text-primary hover:underline">
                <i className="bi bi-arrow-left me-1" aria-hidden /> {t.t('pa.back')}
              </Link>
              <h1 className="mt-1 text-2xl font-bold text-ink-heading">
                {t.t(promotion ? 'pa.edit' : 'pa.create')}
              </h1>
            </div>

            <Card>
              <CardBody>
                <PromotionForm
                  values={{
                    id: promotion?.id ?? 0,
                    title: promotion?.title ?? '',
                    titleBn: promotion?.title_bn ?? '',
                    description: promotion?.description ?? '',
                    descriptionBn: promotion?.description_bn ?? '',
                    offerText: promotion?.offer_text ?? '',
                    offerTextBn: promotion?.offer_text_bn ?? '',
                    discountPercent:
                      promotion?.discount_percent !== null && promotion?.discount_percent !== undefined
                        ? String(Number(promotion.discount_percent))
                        : '',
                    buttonText: promotion?.button_text ?? '',
                    buttonTextBn: promotion?.button_text_bn ?? '',
                    buttonUrl: promotion?.button_url ?? '',
                    position: promotion?.display_position ?? 'home_section',
                    style: promotion?.style ?? 'green',
                    sortOrder: promotion?.sort_order ?? 0,
                    // A new promotion is active by default; its dates decide when
                    // it actually shows.
                    isActive: promotion?.is_active ?? true,
                    startAt: localValue(promotion?.start_at ?? null),
                    endAt: localValue(promotion?.end_at ?? null),
                    imageUrl: promotion?.image ? uploadUrl(promotion.image) : '',
                  }}
                  positions={PROMOTION_POSITIONS.map((value) => ({
                    value,
                    label: t.t(`pa.pos.${value}`),
                  }))}
                  styles={PROMOTION_STYLES.map((value) => ({
                    value,
                    label: t.t(`pa.style.${value}`),
                  }))}
                  labels={{
                    name: t.t('pa.name'),
                    nameBn: t.t('pa.name_bn'),
                    description: t.t('pa.desc'),
                    descriptionBn: t.t('pa.desc_bn'),
                    offer: t.t('pa.offer'),
                    offerBn: t.t('pa.offer_bn'),
                    offerPlaceholder: t.t('pa.offer_ph'),
                    percent: t.t('pa.percent'),
                    percentHint: t.t('pa.percent_hint'),
                    button: t.t('pa.button'),
                    buttonBn: t.t('pa.button_bn'),
                    url: t.t('pa.url'),
                    urlHint: t.t('pa.url_hint'),
                    position: t.t('pa.position'),
                    positionHint: t.t('pa.pos_hint'),
                    style: t.t('pa.style'),
                    order: t.t('pa.order'),
                    active: t.t('pa.active'),
                    start: t.t('pa.start'),
                    end: t.t('pa.end'),
                    image: t.t('pa.image'),
                    imageHint: t.t('pa.image_hint'),
                    removeImage: t.t('pa.remove_image'),
                    preview: t.t('pa.preview'),
                    save: t.t('pa.save'),
                    saving: t.t('common.please_wait'),
                    back: t.t('pa.back'),
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
