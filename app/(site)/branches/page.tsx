import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { publicBranches } from '@/lib/site/branches';
import { prisma } from '@/lib/db/prisma';
import { cached, TAGS } from '@/lib/cache';
import { uploadUrl } from '@/lib/storage/url';
import { formatPhone, telHref, safeUrl, mapSearchUrl } from '@/lib/site/url';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'pbr.title'),
    description: translate(lang, 'pbr.sub'),
  };
}

/**
 * The branch list, from branches.php.
 *
 * Only active branches — a closed centre must disappear rather than keep taking
 * enquiries. Course and batch counts come from one grouped query each rather
 * than a query per branch.
 */
/** Per-branch course and batch counts for the cards — shared by every visitor. */
const loadBranchCounts = cached(
  async () => {
    const [courses, batches] = await Promise.all([
      prisma.branchCourse.groupBy({
        by: ['branch_id'],
        where: { status: 'active' },
        _count: { course_id: true },
      }),
      prisma.batch.groupBy({
        by: ['branch_id'],
        where: { status: 'active' },
        _count: { id: true },
      }),
    ]);
    return {
      courses: courses.map((row) => [row.branch_id, row._count.course_id] as [number, number]),
      batches: batches
        .filter((row) => row.branch_id !== null)
        .map((row) => [row.branch_id as number, row._count.id] as [number, number]),
    };
  },
  ['site:branch-counts'],
  { tags: [TAGS.branches, TAGS.courses], revalidate: 600 }
);

export default async function BranchesPage() {
  const t = await getTranslator();
  const branches = await publicBranches();

  let courseCounts = new Map<number, number>();
  let batchCounts = new Map<number, number>();
  try {
    const counts = await loadBranchCounts();
    courseCounts = new Map(counts.courses);
    batchCounts = new Map(counts.batches);
  } catch {
    // Requires database configuration — the cards render without counts.
  }

  return (
    <>
      <SiteHeader active="branches" />
      <PageHeader
        title={t.t('pbr.title')}
        subtitle={t.t('pbr.sub')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('pbr.nav') }]}
      />

      <PageBody>
        {branches.length === 0 ? (
          <Card>
            <EmptyState icon="bi-diagram-3" title={t.t('pbr.title')} body={t.t('pbr.not_found')} />
          </Card>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => {
              const name = t.pickPair(branch, 'name');
              const address = t.pickPair(branch, 'address');
              const image = uploadUrl(branch.image);
              const map = safeUrl(branch.map_url) || mapSearchUrl(address);

              return (
                <li key={branch.id}>
                  <Card className="flex h-full flex-col overflow-hidden">
                    <Link href={`/branches/${branch.slug}`} className="block">
                      <div className="aspect-[16/9] overflow-hidden bg-surface-3">
                        {image !== '' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-3xl text-ink-muted/40">
                            <i className="bi bi-building" aria-hidden />
                          </div>
                        )}
                      </div>
                    </Link>

                    <CardBody className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-head text-lg font-semibold text-ink-heading">
                          <Link href={`/branches/${branch.slug}`} className="transition hover:text-primary">
                            {name}
                          </Link>
                        </h2>
                        {branch.is_main && <Badge tone="info">{t.t('branch.main')}</Badge>}
                      </div>

                      {address !== '' && (
                        <p className="mt-2 flex gap-2 text-sm text-ink-muted">
                          <i className="bi bi-geo-alt-fill mt-0.5 shrink-0" aria-hidden />
                          <span>{address}</span>
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <Badge tone="neutral" icon="bi-journal-bookmark">
                          {t.t('pbr.count_courses', { count: t.digits(courseCounts.get(branch.id) ?? 0) })}
                        </Badge>
                        <Badge tone="neutral" icon="bi-collection">
                          {t.t('pbr.count_batches', { count: t.digits(batchCounts.get(branch.id) ?? 0) })}
                        </Badge>
                      </div>

                      <div className="mt-auto flex flex-wrap gap-2 pt-4">
                        <Link
                          href={`/branches/${branch.slug}`}
                          className="inline-flex items-center gap-1.5 rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                        >
                          {t.t('pbr.details')}
                        </Link>
                        {branch.phone && (
                          <a
                            href={telHref(branch.phone)}
                            className="inline-flex items-center gap-1.5 rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                          >
                            <i className="bi bi-telephone-fill" aria-hidden />
                            {formatPhone(branch.phone)}
                          </a>
                        )}
                        {map !== '' && (
                          <a
                            href={map}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                          >
                            <i className="bi bi-map" aria-hidden />
                            {t.t('pbr.directions')}
                          </a>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
