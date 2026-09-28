import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { DeleteGift, GiftToggle } from './GiftForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'agift.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Free gifts, from admin/gifts.php.
 *
 * The banner at the top is the point of the page: with no active gift the
 * homepage section disappears entirely, and somebody who has just deactivated
 * the last one should not have to open the site to find that out.
 */
export default async function AdminGiftsPage() {
  return (
    <AdminPage active="gifts" route="/admin/gifts" title="">
      {async ({ t }) => {
        // The same order as the homepage.
        const gifts = await prisma.gift
          .findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'desc' }] })
          .catch(() => []);
        const active = gifts.filter((gift) => gift.is_active).length;

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('agift.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('agift.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/#free-gift"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-box-arrow-up-right me-1" aria-hidden />
                  {t.t('agift.view_home')}
                </a>
                <Link
                  href="/admin/gifts/new"
                  className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  <i className="bi bi-plus-circle me-1" aria-hidden /> {t.t('agift.create')}
                </Link>
              </div>
            </div>

            {gifts.length > 0 && (
              <Alert tone={active > 0 ? 'success' : 'warning'}>
                {active > 0
                  ? t.t('agift.live_count', { count: t.digits(active) })
                  : t.t('agift.hidden_notice')}
              </Alert>
            )}

            <Card>
              <CardHeader title={t.t('agift.col_gift')} icon="bi-gift" />

              {gifts.length === 0 ? (
                <EmptyState icon="bi-gift" title={t.t('agift.none')} body={t.t('agift.sub')} />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {gifts.map((gift) => {
                    const image = gift.image !== null ? uploadUrl(gift.image) : '';

                    return (
                      <li key={gift.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                        {image !== '' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-orbit bg-surface-2 object-contain"
                          />
                        ) : (
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-orbit bg-surface-2 text-ink-muted">
                            <i className="bi bi-gift" aria-hidden />
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink-heading">
                              {t.pick(gift, 'name')}
                            </span>
                            <Badge tone={gift.is_active ? 'success' : 'neutral'}>
                              {t.t(gift.is_active ? 'agift.status_active' : 'agift.status_inactive')}
                            </Badge>
                          </p>

                          {(gift.description ?? '').trim() !== '' && (
                            <p className="mt-0.5 text-sm text-ink-muted">
                              {t.pick(gift, 'description')}
                            </p>
                          )}

                          <p className="mt-1 text-xs text-ink-muted">
                            {t.t('agift.order')}: {t.digits(gift.sort_order)}
                          </p>
                        </div>

                        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <GiftToggle
                            giftId={gift.id}
                            isActive={gift.is_active}
                            labels={{
                              activate: t.t('agift.activate'),
                              deactivate: t.t('agift.deactivate'),
                            }}
                          />
                          <Link
                            href={`/admin/gifts/${gift.id}/edit`}
                            title={t.t('common.edit')}
                            aria-label={t.t('common.edit')}
                            className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                          >
                            <i className="bi bi-pencil" aria-hidden />
                          </Link>
                          <DeleteGift
                            giftId={gift.id}
                            labels={{
                              remove: t.t('common.delete'),
                              confirm: t.t('agift.delete_confirm'),
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
