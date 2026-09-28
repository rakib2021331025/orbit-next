import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/site/SearchBox';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { instituteName } from '@/lib/settings';
import { prisma } from '@/lib/db/prisma';
import { branchBySlug } from '@/lib/site/branches';
import { paginate, pageHref } from '@/lib/paginate';
import { cached, TAGS } from '@/lib/cache';

const PER_PAGE = 10;

type NoticeFilter = Parameters<typeof prisma.notice.findMany>[0] extends infer A
  ? A extends { where?: infer W } ? W : never
  : never;

/**
 * One page of the board. The unsearched board (by branch and page) is the same
 * for every visitor, so it sits in the shared cache and the admin Notices page
 * drops it on every change. Searches are not cached: their keys are unbounded.
 */
async function noticePage(filter: NoticeFilter, page: number) {
  const total = await prisma.notice.count({ where: filter });
  const pager = paginate(total, PER_PAGE, page);
  const rows = await prisma.notice.findMany({
    where: filter,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    skip: pager.offset,
    take: pager.perPage,
    select: { id: true, title: true, description: true, created_at: true, branch_id: true },
  });
  return { total, rows };
}

const cachedNoticePage = cached(
  (filterJson: string, page: number) => noticePage(JSON.parse(filterJson) as NoticeFilter, page),
  ['site:notices'],
  { tags: [TAGS.notices], revalidate: 300 }
);

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'notice.title'),
    description: translate(lang, 'notice.sub', { institute: await instituteName(lang) }),
  };
}

/**
 * The public notice board, from notice.php.
 *
 * `?branch=<slug>` narrows to one branch **plus** the notices addressed to every
 * branch (`branch_id IS NULL`). Dropping the shared half would hide the
 * institute-wide announcements from exactly the people reading a branch page.
 */
export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string; page?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslator();

  const search = (params.q ?? '').trim().slice(0, 100);
  const branch = params.branch ? await branchBySlug(params.branch) : null;

  // Both the search and the branch filter want an OR, so they are combined
  // under AND rather than one overwriting the other — which is what happens when
  // two `OR` keys end up in the same object literal.
  const conditions = [];
  if (search !== '') {
    conditions.push({
      OR: [{ title: { contains: search } }, { description: { contains: search } }],
    });
  }
  if (branch) {
    // That branch's notices PLUS the ones addressed to every branch. Dropping the
    // shared half would hide institute-wide announcements from exactly the people
    // reading a branch page.
    conditions.push({ OR: [{ branch_id: branch.id }, { branch_id: null }] });
  }
  const filter = { status: 'active' as const, ...(conditions.length ? { AND: conditions } : {}) };

  let total = 0;
  let notices: { id: number; title: string; description: string; created_at: Date; branch_id: number | null }[] = [];
  try {
    const pageNo = Math.max(1, Number(params.page ?? 1) || 1);
    const result =
      search === ''
        ? await cachedNoticePage(JSON.stringify(filter), pageNo)
        : await noticePage(filter, pageNo);
    total = result.total;
    notices = result.rows;
  } catch {
    // Requires database configuration — renders as an empty board until then.
  }

  const pager = paginate(total, PER_PAGE, params.page ?? 1);
  // "New" is the last seven days, as the original marks it.
  const newSince = new Date(Date.now() - 7 * 86_400_000);

  return (
    <>
      <SiteHeader active="notices" />
      <PageHeader
        title={t.t('notice.title')}
        subtitle={t.t('notice.sub', { institute: await instituteName() })}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('nav.notices') }]}
      />

      <PageBody>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <SearchBox
            action="/notices"
            name="q"
            defaultValue={search}
            label={t.t('common.search')}
            placeholder={t.t('notice.search_ph')}
            hidden={branch ? { branch: branch.slug } : undefined}
          />
          {total > 0 && (
            <p className="text-sm text-ink-muted">
              {t.t('notice.results', { count: t.digits(pager.total) })}
            </p>
          )}
        </div>

        {notices.length === 0 ? (
          <Card>
            <EmptyState
              icon="bi-megaphone"
              title={t.t('notice.none_title')}
              body={t.t('notice.none')}
            />
          </Card>
        ) : (
          <ul className="space-y-4">
            {notices.map((notice) => (
              <li key={notice.id}>
                <Card>
                  <CardBody>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <time dateTime={notice.created_at.toISOString()}>
                        {t.date(notice.created_at, 'd M Y')}
                      </time>
                      {notice.created_at >= newSince && (
                        <Badge tone="success">{t.t('notice.new')}</Badge>
                      )}
                      {notice.branch_id === null && branch && (
                        <Badge tone="neutral">{t.t('branch.all_branches')}</Badge>
                      )}
                    </div>

                    <h2 className="mt-2 font-head text-lg font-semibold text-ink-heading">
                      {notice.title}
                    </h2>
                    {/* Admin-authored plain text: rendered as text with its line
                        breaks kept, never as HTML. */}
                    <p className="mt-2 whitespace-pre-line text-ink">{notice.description}</p>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={pager.page}
          totalPages={pager.totalPages}
          hrefFor={(page) =>
            pageHref('/notices', { q: search, branch: branch?.slug }, page)
          }
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
