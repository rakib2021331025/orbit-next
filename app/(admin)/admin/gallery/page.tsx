import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { paginate } from '@/lib/paginate';
import { uploadUrl } from '@/lib/storage/url';
import { MAX_IMAGE_MB, categoryList, imageFilters, imageWhere } from '@/lib/gallery/admin';
import { ImageForm, ImageGrid, UploadForm, type ImageRow } from './GalleryForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'agal.manage.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The gallery images, from admin/gallery_add.php and admin/gallery_manage.php.
 *
 * Both halves live on one page because they are one job: upload a batch, then
 * tidy it up. An image is public only when it is **active** and its category is
 * **visible**, which is why the row says both.
 */
export default async function AdminGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="gallery" route="/admin/gallery" title="">
      {async ({ t }) => {
        const filters = imageFilters(params);
        const where = imageWhere(filters);

        const [categories, total] = await Promise.all([
          categoryList(),
          prisma.gallery.count({ where }).catch(() => 0),
        ]);

        const pager = paginate(total, 24, filters.page);
        const images = await prisma.gallery
          .findMany({
            where,
            orderBy: [{ featured: 'desc' }, { sort_order: 'asc' }, { id: 'desc' }],
            take: pager.perPage,
            skip: pager.offset,
          })
          .catch(() => []);

        const hiddenCategories = new Set(
          categories.filter((category) => category.status !== 'active').map((c) => c.id)
        );

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.gallery.findUnique({ where: { id: editId } }).catch(() => null)
            : null;
        const missing = editId > 0 && editing === null;

        const listQuery = new URLSearchParams();
        if (filters.categoryId !== 0) listQuery.set('category', String(filters.categoryId));
        if (filters.status !== '') listQuery.set('status', filters.status);
        if (filters.featured) listQuery.set('featured', '1');
        if (filters.q !== '') listQuery.set('q', filters.q);

        const listUrl = `/admin/gallery${listQuery.toString() !== '' ? `?${listQuery}` : ''}`;
        const editHref = (id: number) => {
          const query = new URLSearchParams(listQuery);
          query.set('edit', String(id));
          return `/admin/gallery?${query}#imageForm`;
        };

        const options = categories.map((category) => ({
          id: category.id,
          label: t.t(
            category.status === 'active' ? 'agal.add.cat_option' : 'agal.add.cat_option_hidden',
            { name: category.name, count: t.digits(category.images) }
          ),
        }));

        const rows: ImageRow[] = images.map((image) => ({
          id: image.id,
          title: image.title,
          category: image.category,
          categoryHidden: image.category_id !== null && hiddenCategories.has(image.category_id),
          imageUrl: uploadUrl(image.image),
          status: image.status ?? 'active',
          featured: image.featured ?? false,
          eventDate: image.event_date
            ? t.t('agal.manage.event_on', { date: t.date(image.event_date, 'd M Y') })
            : '',
          sortOrder: t.digits(image.sort_order),
        }));

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('agal.manage.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('agal.manage.sub')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/gallery-categories"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-tags me-1" aria-hidden /> {t.t('agal.nav_categories')}
                </Link>
                <a
                  href="/gallery"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-box-arrow-up-right me-1" aria-hidden />
                  {t.t('agal.view_gallery')}
                </a>
              </div>
            </div>

            {missing && <Alert tone="warning">{t.t('agal.manage.not_found')}</Alert>}

            {categories.length === 0 ? (
              <Card>
                <EmptyState
                  icon="bi-tags"
                  title={t.t('agal.add.no_categories_title')}
                  body={t.t('agal.add.no_categories')}
                  action={
                    <Link
                      href="/admin/gallery-categories"
                      className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                    >
                      {t.t('agal.add.create_category')}
                    </Link>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-6 xl:grid-cols-3">
                <div className="xl:col-span-1">
                  <Card>
                    <CardHeader
                      title={t.t(editing ? 'agal.manage.edit' : 'agal.nav_upload')}
                      icon={editing ? 'bi-pencil-square' : 'bi-cloud-arrow-up'}
                    />
                    <CardBody>
                      {editing ? (
                        <ImageForm
                          values={{
                            id: editing.id,
                            title: editing.title,
                            description: editing.description ?? '',
                            categoryId: editing.category_id ?? 0,
                            eventDate: editing.event_date
                              ? editing.event_date.toISOString().slice(0, 10)
                              : '',
                            featured: editing.featured ?? false,
                            status: editing.status ?? 'active',
                            sortOrder: editing.sort_order,
                            imageUrl: uploadUrl(editing.image),
                          }}
                          categories={options}
                          cancelHref={listUrl}
                          labels={{
                            title: t.t('agal.f_title'),
                            description: t.t('agal.f_desc'),
                            category: t.t('agal.f_category'),
                            categoryNone: t.t('agal.manage.f_category_none'),
                            eventDate: t.t('agal.f_event_date'),
                            sort: t.t('agal.f_sort'),
                            sortHelp: t.t('agal.manage.f_sort_help'),
                            status: t.t('common.status'),
                            statusActive: t.t('agal.add.status_active'),
                            statusInactive: t.t('agal.add.status_inactive'),
                            statusHelp: t.t('agal.manage.f_status_help'),
                            featured: t.t('agal.manage.f_featured'),
                            featuredHelp: t.t('agal.manage.f_featured_help'),
                            save: t.t('agal.manage.save'),
                            saving: t.t('common.please_wait'),
                            cancelEdit: t.t('agal.manage.cancel_edit'),
                          }}
                        />
                      ) : (
                        <UploadForm
                          categories={options}
                          initialCategory={
                            typeof filters.categoryId === 'number' ? filters.categoryId : 0
                          }
                          maxMb={MAX_IMAGE_MB}
                          labels={{
                            category: t.t('agal.f_category'),
                            categoryChoose: t.t('agal.add.cat_choose'),
                            categoryHelp: t.t('agal.add.f_category_help'),
                            categoryLink: t.t('agal.add.f_category_link'),
                            images: t.t('agal.add.f_images'),
                            dropHelp: t.t('agal.add.drop_help', {
                              size: '{size}',
                              files: t.digits(20),
                              total: t.digits(MAX_IMAGE_MB * 20),
                            }),
                            ready: t.t('agal.add.js_ready', { count: '{count}' }),
                            title: t.t('agal.f_title'),
                            titlePlaceholder: t.t('agal.add.f_title_ph'),
                            titleHelp: t.t('agal.add.f_title_help'),
                            description: t.t('agal.f_desc'),
                            descriptionPlaceholder: t.t('agal.add.f_desc_ph'),
                            eventDate: t.t('agal.f_event_date'),
                            status: t.t('common.status'),
                            statusActive: t.t('agal.add.status_active'),
                            statusInactive: t.t('agal.add.status_inactive'),
                            featured: t.t('agal.add.f_featured'),
                            upload: t.t('agal.add.upload'),
                            uploading: t.t('agal.add.uploading'),
                            reportTitle: t.t('agal.add.report_title'),
                            badgeSaved: t.t('agal.add.badge_saved'),
                            badgeRejected: t.t('agal.add.badge_rejected'),
                            itemSaved: t.t('agal.add.item_saved', { title: '{title}' }),
                          }}
                        />
                      )}
                    </CardBody>
                  </Card>
                </div>

                <div className="xl:col-span-2">
                  <Card>
                    <CardHeader
                      title={t.t('agal.nav_manage')}
                      icon="bi-images"
                      actions={
                        <span className="text-xs text-ink-muted">
                          {t.t('agal.manage.count', { count: t.digits(pager.total) })}
                        </span>
                      }
                    />

                    <form
                      method="get"
                      className="grid gap-3 border-b border-line-soft px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ink-muted">{t.t('agal.f_category')}</span>
                        <select
                          name="category"
                          defaultValue={filters.categoryId === 0 ? '' : String(filters.categoryId)}
                          className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                        >
                          <option value="">{t.t('agal.manage.all_categories')}</option>
                          <option value="none">{t.t('agal.uncategorised')}</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ink-muted">{t.t('common.status')}</span>
                        <select
                          name="status"
                          defaultValue={filters.status}
                          className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                        >
                          <option value="">{t.t('agal.manage.any_status')}</option>
                          <option value="active">{t.t('status.active')}</option>
                          <option value="inactive">{t.t('status.inactive')}</option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ink-muted">{t.t('common.search')}</span>
                        <input
                          type="search"
                          name="q"
                          maxLength={100}
                          defaultValue={filters.q}
                          placeholder={t.t('agal.manage.search_ph')}
                          className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                        />
                      </label>

                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            name="featured"
                            value="1"
                            defaultChecked={filters.featured}
                            className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
                          />
                          <span>{t.t('agal.featured')}</span>
                        </label>
                        <button
                          type="submit"
                          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                        >
                          {t.t('common.filter')}
                        </button>
                      </div>
                    </form>

                    {rows.length === 0 ? (
                      <EmptyState
                        icon="bi-images"
                        title={t.t(
                          listQuery.toString() !== ''
                            ? 'agal.manage.none'
                            : 'agal.manage.none_all'
                        )}
                        body={t.t('agal.manage.sub')}
                      />
                    ) : (
                      <CardBody>
                        <ImageGrid
                          rows={rows}
                          categories={options}
                          editHref={editHref}
                          labels={{
                            selectAll: t.t('agal.manage.select_all'),
                            selectItem: t.t('agal.manage.select_item', { title: '{title}' }),
                            selected: t.t('agal.manage.selected', { count: '{count}' }),
                            bulkLabel: t.t('agal.manage.bulk_label'),
                            bulkChoose: t.t('agal.manage.bulk_choose'),
                            bulkActivate: t.t('agal.manage.bulk_activate'),
                            bulkDeactivate: t.t('agal.manage.bulk_deactivate'),
                            bulkMove: t.t('agal.manage.bulk_move'),
                            bulkDelete: t.t('agal.manage.bulk_delete'),
                            bulkTarget: t.t('agal.manage.bulk_target'),
                            bulkDeleteConfirm: t.t('agal.manage.bulk_delete_confirm', {
                              count: '{count}',
                            }),
                            apply: t.t('agal.manage.apply'),
                            edit: t.t('common.edit'),
                            openFull: t.t('agal.manage.open_full'),
                            remove: t.t('common.delete'),
                            deleteConfirm: t.t('agal.manage.delete_confirm'),
                            cancel: t.t('common.cancel'),
                            visible: t.t('agal.visible'),
                            hidden: t.t('agal.hidden'),
                            featured: t.t('agal.featured'),
                            uncategorised: t.t('agal.uncategorised'),
                            categoryHidden: t.t('agal.manage.category_hidden'),
                            noFile: t.t('agal.manage.no_file'),
                          }}
                        />
                      </CardBody>
                    )}

                    {pager.totalPages > 1 && (
                      <CardBody>
                        <Pagination
                          page={pager.page}
                          totalPages={pager.totalPages}
                          hrefFor={(page) => {
                            const query = new URLSearchParams(listQuery);
                            if (page > 1) query.set('page', String(page));
                            const text = query.toString();
                            return `/admin/gallery${text !== '' ? `?${text}` : ''}`;
                          }}
                          labels={{
                            previous: t.t('common.previous'),
                            next: t.t('common.next'),
                            pageOf: t.t('gallery.page_of'),
                          }}
                          format={t.digits}
                        />
                      </CardBody>
                    )}
                  </Card>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </AdminPage>
  );
}
