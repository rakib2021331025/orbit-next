import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/site/SearchBox';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { paginate, pageHref } from '@/lib/paginate';
import { cached, TAGS } from '@/lib/cache';
import { uploadUrl } from '@/lib/storage/url';
import { cn } from '@/lib/cn';

const PER_PAGE = 24;

const loadCategories = cached(
  () =>
    prisma.galleryCategory.findMany({
      where: { status: 'active' },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true },
    }),
  ['site:gallery-categories'],
  { tags: [TAGS.gallery], revalidate: 3600 }
);

type GalleryFilter = NonNullable<Parameters<typeof prisma.gallery.findMany>[0]>['where'];

/** One page of photos. Unsearched pages are shared by every visitor and cached. */
async function galleryPage(filter: GalleryFilter, page: number) {
  const total = await prisma.gallery.count({ where: filter });
  const pager = paginate(total, PER_PAGE, page);
  const rows = await prisma.gallery.findMany({
    where: filter,
    orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }, { id: 'desc' }],
    skip: pager.offset,
    take: pager.perPage,
    select: { id: true, title: true, description: true, image: true, event_date: true, featured: true },
  });
  return { total, rows };
}

const cachedGalleryPage = cached(
  (filterJson: string, page: number) => galleryPage(JSON.parse(filterJson) as GalleryFilter, page),
  ['site:gallery'],
  { tags: [TAGS.gallery], revalidate: 600 }
);

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'gallery.title'),
    description: translate(lang, 'gallery.sub'),
  };
}

/**
 * The photo gallery, from gallery.php: category chips, a search and a paginated
 * grid.
 *
 * Both filters are links and a GET form, so any view of the gallery has its own
 * URL. Featured photos are marked but not reordered — the original keeps
 * `sort_order` then newest, and reordering here would shuffle an album an admin
 * arranged by hand.
 */
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslator();

  const search = (params.q ?? '').trim().slice(0, 100);
  const categorySlug = (params.category ?? '').trim().slice(0, 160);

  let categories: { id: number; name: string; slug: string }[] = [];
  try {
    categories = await loadCategories();
  } catch {
    // Requires database configuration.
  }

  const category = categories.find((row) => row.slug === categorySlug) ?? null;

  const conditions = [];
  if (search !== '') {
    conditions.push({
      OR: [
        { title: { contains: search } },
        { description: { contains: search } },
        { category: { contains: search } },
      ],
    });
  }
  if (category) {
    // Older rows carry the category as a name rather than an id, so both are
    // matched — filtering on `category_id` alone silently hides them.
    conditions.push({ OR: [{ category_id: category.id }, { category: category.name }] });
  }
  const filter = { status: 'active' as const, ...(conditions.length ? { AND: conditions } : {}) };

  let total = 0;
  let photos: {
    id: number;
    title: string;
    description: string | null;
    image: string;
    event_date: Date | null;
    featured: boolean | null;
  }[] = [];
  try {
    const pageNo = Math.max(1, Number(params.page ?? 1) || 1);
    const result =
      search === ''
        ? await cachedGalleryPage(JSON.stringify(filter), pageNo)
        : await galleryPage(filter, pageNo);
    total = result.total;
    photos = result.rows;
  } catch {
    // Requires database configuration.
  }

  const pager = paginate(total, PER_PAGE, params.page ?? 1);

  return (
    <>
      <SiteHeader active="gallery" />
      <PageHeader
        title={t.t('gallery.title')}
        subtitle={t.t('gallery.sub')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('nav.gallery') }]}
      />

      <PageBody>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label={t.t('common.filter')} className="flex flex-wrap gap-2">
            <Chip href={pageHref('/gallery', { q: search }, 1)} active={!category}>
              {t.t('gallery.all')}
            </Chip>
            {categories.map((row) => (
              <Chip
                key={row.id}
                href={pageHref('/gallery', { q: search, category: row.slug }, 1)}
                active={category?.id === row.id}
              >
                {row.name}
              </Chip>
            ))}
          </div>

          <SearchBox
            action="/gallery"
            name="q"
            defaultValue={search}
            label={t.t('common.search')}
            placeholder={t.t('gallery.search_ph')}
            hidden={category ? { category: category.slug } : undefined}
          />
        </div>

        {total > 0 && (
          <p className="mb-4 text-sm text-ink-muted">
            {search !== ''
              ? t.t('gallery.count_for', { search, count: t.digits(total) })
              : t.t('gallery.count', { count: t.digits(total) })}
          </p>
        )}

        {photos.length === 0 ? (
          <Card>
            <EmptyState icon="bi-images" title={t.t('gallery.none_title')} body={t.t('gallery.none')} />
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => {
              const src = uploadUrl(photo.image);
              return (
                <li key={photo.id}>
                  <figure className="group relative overflow-hidden rounded-orbit border border-line-soft bg-surface-3">
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t.t('gallery.open', { title: photo.title })}
                      className="block"
                    >
                      <div className="aspect-square overflow-hidden">
                        {src !== '' && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt={photo.title}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        )}
                      </div>
                      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 text-white">
                        <p className="line-clamp-2 text-xs font-medium">{photo.title}</p>
                        {photo.event_date && (
                          <p className="mt-0.5 text-[11px] text-white/70">
                            {t.date(photo.event_date, 'd M Y')}
                          </p>
                        )}
                      </figcaption>
                    </a>

                    {photo.featured && (
                      <span className="absolute start-2 top-2">
                        <Badge tone="warning" icon="bi-star-fill">
                          {t.t('gallery.featured')}
                        </Badge>
                      </span>
                    )}
                  </figure>
                </li>
              );
            })}
          </ul>
        )}

        <Pagination
          page={pager.page}
          totalPages={pager.totalPages}
          hrefFor={(page) => pageHref('/gallery', { q: search, category: category?.slug }, page)}
          labels={{
            previous: t.t('common.previous'),
            next: t.t('common.next'),
            pageOf: t.t('gallery.page_of'),
          }}
          format={t.digits}
          className="mt-8"
        />
      </PageBody>
    </>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
        active
          ? 'border-primary bg-primary text-white'
          : 'border-line bg-surface text-ink hover:bg-surface-2'
      )}
    >
      {children}
    </Link>
  );
}
