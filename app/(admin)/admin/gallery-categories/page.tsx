import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { MAX_IMAGE_MB, categoryList } from '@/lib/gallery/admin';
import { CategoryForm, CategoryRowActions, RenumberButton } from './CategoryForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'agal.cat.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Gallery categories, from admin/gallery_categories.php.
 *
 * Only a **visible** category with **active** images becomes a filter chip on
 * the public gallery, which is why the row shows both its visibility and how
 * many images it holds.
 */
export default async function AdminGalleryCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="gallery_categories" route="/admin/gallery-categories" title="">
      {async ({ t }) => {
        const [categories, uncategorised] = await Promise.all([
          categoryList(),
          prisma.gallery.count({ where: { category_id: null } }).catch(() => 0),
        ]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing = categories.find((category) => category.id === editId) ?? null;
        const missing = editId > 0 && editing === null;

        const year = new Date().getFullYear() + 1;
        const suggestions = [
          t.t('agal.cat.sug_ssc', { year: String(year) }),
          t.t('agal.cat.sug_hsc', { year: String(year) }),
          t.t('agal.cat.sug_classroom'),
          t.t('agal.cat.sug_campus'),
          t.t('agal.cat.sug_events'),
          t.t('agal.cat.sug_seminar'),
          t.t('agal.cat.sug_picnic'),
          t.t('agal.cat.sug_parents'),
          t.t('agal.cat.sug_admission'),
          t.t('agal.cat.sug_success'),
        ];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('agal.cat.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('agal.cat.sub')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink-muted">
                  {t.t('agal.cat.count', { count: t.digits(categories.length) })}
                </span>
                <Link
                  href="/admin/gallery"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-images me-1" aria-hidden /> {t.t('admin.nav.gallery')}
                </Link>
              </div>
            </div>

            {missing && <Alert tone="warning">{t.t('agal.cat.not_found')}</Alert>}

            {uncategorised > 0 && (
              <Alert tone="info">
                {t.t('agal.cat.uncategorised_alert', { count: t.digits(uncategorised) })}{' '}
                <Link href="/admin/gallery?category=none" className="underline">
                  {t.t('agal.cat.uncategorised_link')}
                </Link>
              </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader
                    title={t.t(editing ? 'agal.cat.edit' : 'agal.cat.add')}
                    icon="bi-tags"
                  />
                  <div className="px-5 py-4">
                    <CategoryForm
                      values={{
                        id: editing?.id ?? 0,
                        name: editing?.name ?? '',
                        description: editing?.description ?? '',
                        sortOrder: editing?.sort_order ?? 0,
                        status: editing?.status ?? 'active',
                        coverUrl: editing?.cover_image ? uploadUrl(editing.cover_image) : '',
                      }}
                      suggestions={suggestions}
                      cancelHref="/admin/gallery-categories"
                      labels={{
                        name: t.t('agal.cat.f_name'),
                        nameHelp: t.t('agal.cat.f_name_help'),
                        suggest: t.t('agal.cat.suggest'),
                        description: t.t('common.description'),
                        descriptionHelp: t.t('agal.cat.f_desc_help'),
                        sort: t.t('agal.cat.f_sort'),
                        sortHelp: t.t('agal.cat.f_sort_help'),
                        sortHelpNew: t.t('agal.cat.f_sort_help_new'),
                        status: t.t('agal.cat.f_status'),
                        statusActive: t.t('agal.cat.status_active'),
                        statusHidden: t.t('agal.cat.status_hidden'),
                        cover: t.t('agal.cat.f_cover'),
                        coverHelp: t.t('agal.cat.f_cover_help', { size: t.digits(MAX_IMAGE_MB) }),
                        coverKeep: t.t('agal.cat.f_cover_keep'),
                        currentCover: t.t('agal.cat.current_cover'),
                        removeCover: t.t('agal.cat.remove_cover'),
                        save: t.t('agal.cat.save'),
                        saving: t.t('common.please_wait'),
                        cancelEdit: t.t('agal.cat.cancel_edit'),
                      }}
                    />
                  </div>
                </Card>
              </div>

              <div className="lg:col-span-2">
                <Card>
                  <CardHeader
                    title={t.t('agal.cat.col_category')}
                    icon="bi-tag"
                    actions={
                      categories.length > 1 ? (
                        <RenumberButton
                          labels={{
                            renumber: t.t('agal.cat.renumber'),
                            confirm: t.t('agal.cat.renumber_confirm'),
                            cancel: t.t('common.cancel'),
                          }}
                        />
                      ) : undefined
                    }
                  />

                  {categories.length === 0 ? (
                    <EmptyState
                      icon="bi-tags"
                      title={t.t('agal.cat.none')}
                      body={t.t('agal.cat.sub')}
                    />
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {categories.map((category) => (
                        <li key={category.id} className="px-5 py-4">
                          <div className="flex flex-wrap items-start gap-3">
                            {category.cover_image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={uploadUrl(category.cover_image)}
                                alt=""
                                className="h-14 w-24 shrink-0 rounded-orbit bg-surface-2 object-cover"
                              />
                            ) : (
                              <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-orbit bg-surface-2 text-ink-muted">
                                <i className="bi bi-image" aria-hidden />
                              </span>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-ink-heading">
                                  {category.name}
                                </span>
                                <Badge tone={category.status === 'active' ? 'success' : 'neutral'}>
                                  {t.t(
                                    category.status === 'active'
                                      ? 'agal.cat.status_active'
                                      : 'agal.cat.status_hidden'
                                  )}
                                </Badge>
                              </p>

                              {(category.description ?? '').trim() !== '' && (
                                <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">
                                  {category.description}
                                </p>
                              )}

                              <p className="mt-1 flex flex-wrap gap-3 text-xs text-ink-muted">
                                <span>
                                  {t.t('agal.cat.col_order')}: {t.digits(category.sort_order)}
                                </span>
                                <Link
                                  href={`/admin/gallery?category=${category.id}`}
                                  title={t.t('agal.cat.view_images', { name: category.name })}
                                  className="hover:text-primary"
                                >
                                  {t.t('agal.cat.col_images')}: {t.digits(category.images)}
                                </Link>
                              </p>
                            </div>

                            <CategoryRowActions
                              categoryId={category.id}
                              status={category.status}
                              images={category.images}
                              labels={{
                                moveUp: t.t('agal.cat.move_up'),
                                moveDown: t.t('agal.cat.move_down'),
                                show: t.t('agal.cat.show'),
                                hide: t.t('agal.cat.hide'),
                                edit: t.t('common.edit'),
                                remove: t.t('common.delete'),
                                confirm: t.t('agal.cat.delete_confirm'),
                                cancel: t.t('common.cancel'),
                                blockedHint: t.t('agal.cat.delete_blocked_hint'),
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </div>
        );
      }}
    </AdminPage>
  );
}
