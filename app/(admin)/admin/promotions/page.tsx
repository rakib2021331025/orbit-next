import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import {
  PROMOTION_POSITIONS,
  promotionState,
  type PromotionPosition,
} from '@/lib/promotions/options';
import { DeletePromotion, PromotionToggle } from './PromotionForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'pa.title'),
    robots: { index: false, follow: false },
  };
}

const TONE = {
  live: 'success',
  scheduled: 'info',
  expired: 'warning',
  off: 'neutral',
} as const;

/**
 * Homepage promotions, from admin/promotions.php.
 *
 * The state badge is the whole story of a row: **live** means visitors see it
 * now, **scheduled** and **expired** mean it is active but outside its window,
 * and **off** means switched off. Active alone never tells you whether it shows.
 */
export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="promotions" route="/admin/promotions" title="">
      {async ({ t }) => {
        const position = PROMOTION_POSITIONS.includes(params.position as PromotionPosition)
          ? (params.position as PromotionPosition)
          : '';

        const rows = await prisma.promotion
          .findMany({
            where: position !== '' ? { display_position: position } : {},
            orderBy: [{ display_position: 'asc' }, { sort_order: 'asc' }, { id: 'desc' }],
          })
          .catch(() => []);

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('pa.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('pa.sub')}</p>
              </div>
              <Link
                href="/admin/promotions/new"
                className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
              >
                <i className="bi bi-plus-circle me-1" aria-hidden /> {t.t('pa.create')}
              </Link>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/promotions"
                aria-current={position === '' ? 'page' : undefined}
                className={`rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                  position === ''
                    ? 'bg-primary text-white'
                    : 'border border-line text-ink hover:bg-surface-2'
                }`}
              >
                {t.t('pa.all_positions')}
              </Link>
              {PROMOTION_POSITIONS.map((value) => (
                <Link
                  key={value}
                  href={`/admin/promotions?position=${value}`}
                  aria-current={position === value ? 'page' : undefined}
                  className={`rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                    position === value
                      ? 'bg-primary text-white'
                      : 'border border-line text-ink hover:bg-surface-2'
                  }`}
                >
                  {t.t(`pa.pos_short.${value}`)}
                </Link>
              ))}
            </div>

            <Card>
              <CardHeader title={t.t('pa.title')} icon="bi-megaphone" />

              {rows.length === 0 ? (
                <EmptyState icon="bi-megaphone" title={t.t('pa.none')} body={t.t('pa.sub')} />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {rows.map((row) => {
                    const state = promotionState(row);
                    const image = row.image !== null ? uploadUrl(row.image) : '';
                    const window = [
                      row.start_at ? t.t('pa.from', { date: t.date(row.start_at, 'd M Y') }) : '',
                      row.end_at
                        ? t.t('pa.until', { date: t.date(row.end_at, 'd M Y') })
                        : t.t('pa.always'),
                    ].filter((part) => part !== '');

                    return (
                      <li key={row.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                        {image !== '' && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image}
                            alt=""
                            className="h-14 w-24 shrink-0 rounded-orbit bg-surface-2 object-cover"
                          />
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink-heading">
                              {t.pick(row, 'title')}
                            </span>
                            <Badge tone={TONE[state]}>{t.t(`pa.state.${state}`)}</Badge>
                            <Badge tone="neutral">
                              {t.t(`pa.pos_short.${row.display_position}`)}
                            </Badge>
                          </p>

                          {(row.description ?? '').trim() !== '' && (
                            <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">
                              {t.pick(row, 'description')}
                            </p>
                          )}

                          <p className="mt-1 text-xs text-ink-muted">
                            {[
                              `${t.t('pa.order')}: ${t.digits(row.sort_order)}`,
                              t.t(`pa.style.${row.style}`),
                              window.join(' · '),
                            ].join(' · ')}
                          </p>
                        </div>

                        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <PromotionToggle
                            promotionId={row.id}
                            isActive={row.is_active}
                            labels={{
                              activate: t.t('agift.activate'),
                              deactivate: t.t('agift.deactivate'),
                            }}
                          />
                          <Link
                            href={`/admin/promotions/${row.id}/edit`}
                            title={t.t('common.edit')}
                            aria-label={t.t('common.edit')}
                            className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                          >
                            <i className="bi bi-pencil" aria-hidden />
                          </Link>
                          <DeletePromotion
                            promotionId={row.id}
                            labels={{
                              remove: t.t('common.delete'),
                              confirm: t.t('pa.delete_confirm'),
                              cancel: t.t('common.cancel'),
                            }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
