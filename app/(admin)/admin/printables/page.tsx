import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, hasTranslation, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { PRINTABLE_CATEGORIES, PRINTABLE_MAX_MB } from '@/lib/printables/options';
import { DeletePrintable, PrintableForm } from './PrintableForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'pdoc.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Printable documents, from admin/printable_documents.php.
 *
 * Images of things an institute prints again and again — a periodic table, a
 * formula sheet, an exam routine. They live in the private upload area and are
 * served through the media route, never by a public URL.
 */
export default async function AdminPrintableDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="printables" route="/admin/printables" title="">
      {async ({ t }) => {
        const search = (params.q ?? '').trim().slice(0, 100);
        const category = (params.category ?? '').trim().slice(0, 80);

        const and: Record<string, unknown>[] = [];
        if (search !== '') {
          and.push({
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          });
        }
        if (category !== '') and.push({ category });

        const [documents, categories] = await Promise.all([
          prisma.printableDocument
            .findMany({
              where: and.length > 0 ? { AND: and } : {},
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            })
            .catch(() => []),
          prisma.printableDocument
            .findMany({ distinct: ['category'], orderBy: { category: 'asc' }, select: { category: true } })
            .catch(() => []),
        ]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.printableDocument.findUnique({ where: { id: editId } }).catch(() => null)
            : null;
        const missing = editId > 0 && editing === null;
        const showForm = editing !== null || params.new === '1' || documents.length === 0;

        /** A preset's own label, or the custom name as it was typed. */
        const categoryLabel = (value: string) => {
          const key = `pdoc.cat_${value}`;
          return (PRINTABLE_CATEGORIES as readonly string[]).includes(value) &&
            hasTranslation(key)
            ? t.t(key)
            : value;
        };

        const preset = (PRINTABLE_CATEGORIES as readonly string[]).includes(
          editing?.category ?? ''
        )
          ? (editing?.category ?? 'general')
          : editing
            ? 'other'
            : 'general';

        const listQuery = new URLSearchParams();
        if (search !== '') listQuery.set('q', search);
        if (category !== '') listQuery.set('category', category);
        const listUrl = `/admin/printables${
          listQuery.toString() !== '' ? `?${listQuery}` : ''
        }`;

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('pdoc.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('pdoc.sub')}</p>
              </div>
              <Link
                href="/admin/printables?new=1#printableForm"
                className="rounded-orbit bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
              >
                <i className="bi bi-plus-circle me-1" aria-hidden /> {t.t('pdoc.create')}
              </Link>
            </div>

            {missing && <Alert tone="warning">{t.t('error.not_found_body')}</Alert>}

            <div className="grid gap-6 xl:grid-cols-3">
              {showForm && (
                <div className="xl:col-span-1">
                  <Card>
                    <CardHeader
                      title={t.t(editing ? 'pdoc.edit' : 'pdoc.create')}
                      icon="bi-file-earmark-image"
                    />
                    <CardBody>
                      <PrintableForm
                        values={{
                          id: editing?.id ?? 0,
                          title: editing?.title ?? '',
                          category: preset,
                          customCategory: preset === 'other' ? (editing?.category ?? '') : '',
                          description: editing?.description ?? '',
                          imageUrl: editing ? uploadUrl(editing.image_path) : '',
                        }}
                        categories={PRINTABLE_CATEGORIES.map((value) => ({
                          value,
                          label: t.t(`pdoc.cat_${value}`),
                        }))}
                        maxMb={PRINTABLE_MAX_MB}
                        cancelHref={listUrl}
                        labels={{
                          title: t.t('pdoc.f_title'),
                          titleHint: t.t('pdoc.f_title_hint'),
                          category: t.t('pdoc.f_category'),
                          customCategory: t.t('pdoc.f_custom_cat'),
                          customHint: t.t('pdoc.f_custom_hint'),
                          description: t.t('pdoc.f_description'),
                          image: t.t('pdoc.f_image'),
                          imageHint: t.t('pdoc.f_image_hint', { size: '{size}' }),
                          imageKeep: t.t('pdoc.f_image_keep'),
                          imageReplace: t.t('pdoc.f_image_replace'),
                          preview: t.t('pdoc.preview'),
                          previewEmpty: t.t('pdoc.preview_empty'),
                          save: t.t('pdoc.save'),
                          saving: t.t('common.please_wait'),
                          back: t.t('pdoc.back'),
                        }}
                      />
                    </CardBody>
                  </Card>
                </div>
              )}

              <div className={showForm ? 'xl:col-span-2' : 'xl:col-span-3'}>
                <Card>
                  <CardHeader title={t.t('pdoc.title')} icon="bi-printer" />

                  <form
                    method="get"
                    className="grid gap-3 border-b border-line-soft px-5 py-4 sm:grid-cols-3"
                  >
                    <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                      <span className="text-ink-muted">{t.t('pdoc.search')}</span>
                      <input
                        type="search"
                        name="q"
                        maxLength={100}
                        defaultValue={search}
                        className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-muted">{t.t('pdoc.f_category')}</span>
                      <select
                        name="category"
                        defaultValue={category}
                        className="rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink"
                      >
                        <option value="">{t.t('pdoc.all_categories')}</option>
                        {categories.map((row) => (
                          <option key={row.category} value={row.category}>
                            {categoryLabel(row.category)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
                      >
                        {t.t('pdoc.filter')}
                      </button>
                    </div>
                  </form>

                  {documents.length === 0 ? (
                    <EmptyState
                      icon="bi-printer"
                      title={t.t(
                        search !== '' || category !== '' ? 'pdoc.none_filtered' : 'pdoc.none'
                      )}
                      body={t.t('pdoc.sub')}
                    />
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {documents.map((document) => {
                        const image = uploadUrl(document.thumb_path ?? document.image_path);

                        return (
                          <li key={document.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                            {image !== '' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={image}
                                alt=""
                                className="h-20 w-16 shrink-0 rounded-orbit bg-surface-2 object-contain"
                              />
                            ) : (
                              <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-orbit bg-surface-2 text-xs text-ink-muted">
                                {t.t('pdoc.image_missing')}
                              </span>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-ink-heading">
                                  {document.title}
                                </span>
                                <Badge tone="neutral">{categoryLabel(document.category)}</Badge>
                              </p>

                              {(document.description ?? '').trim() !== '' && (
                                <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">
                                  {document.description}
                                </p>
                              )}

                              <p className="mt-1 text-xs text-ink-muted">
                                {[
                                  document.image_width > 0
                                    ? t.t('pdoc.dimensions', {
                                        w: t.digits(document.image_width),
                                        h: t.digits(document.image_height),
                                      })
                                    : '',
                                  t.date(document.created_at, 'd M Y'),
                                ]
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </p>
                            </div>

                            <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                              <a
                                href={`/api/printable/${document.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                              >
                                <i className="bi bi-printer me-1" aria-hidden />
                                {t.t('pdoc.act_print')}
                              </a>
                              <Link
                                href={`/admin/printables?edit=${document.id}#printableForm`}
                                title={t.t('common.edit')}
                                aria-label={t.t('common.edit')}
                                className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                              >
                                <i className="bi bi-pencil" aria-hidden />
                              </Link>
                              <DeletePrintable
                                documentId={document.id}
                                labels={{
                                  remove: t.t('common.delete'),
                                  confirm: t.t('pdoc.delete_confirm'),
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
            </div>
          </div>
        );
      }}
    </AdminPage>
  );
}
