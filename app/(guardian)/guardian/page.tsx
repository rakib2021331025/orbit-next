import type { Metadata } from 'next';
import Link from 'next/link';
import { GuardianPage } from '@/components/portal/GuardianPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { helplineNumber } from '@/lib/settings';
import { formatPhone, telHref } from '@/lib/site/url';
import { studentPhotoUrl } from '@/lib/storage/url';
import { studentScope } from '@/lib/student/scope';
import { studentAttendanceSummary, studentPaymentTotals } from '@/lib/student/data';
import { studentPublishedResults } from '@/lib/results/exam';
import { displayId } from '@/lib/pdf/idcard';
import { prisma } from '@/lib/db/prisma';
import { childCourse, monthRange, parseMonth, relationLabel } from '@/lib/guardians/portal';
import type { GuardianChild } from '@/lib/auth/guards';
import type { Translator } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'guardian.dash.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The guardian dashboard, from guardian/dashboard.php.
 *
 * One card per linked, ACTIVE child — this month's attendance, the latest
 * published exam and what is still owed — then the latest notices and how to
 * reach the office. A guardian with several children sees all of them at once;
 * the child switcher only matters on the pages that are about one child.
 */
export default async function GuardianDashboardPage() {
  return (
    <GuardianPage active="dashboard" title={translate(await getLang(), 'guardian.dash.title')}>
      {async ({ guardian, children, t }) => {
        const month = parseMonth(undefined);
        const { from, to } = monthRange(month);

        const [cards, notices, helpline] = await Promise.all([
          Promise.all(children.map((child) => childCard(child, from, to, t))),
          latestNotices(children),
          helplineNumber(),
        ]);

        const noticesHref = children[0] ? `/guardian/notices?student=${children[0].id}` : '/guardian/notices';

        return (
          <div className="space-y-6">
            <section className="flex items-center gap-4 rounded-orbit border border-line-soft bg-surface px-5 py-4 shadow-orbit">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-soft text-xl text-primary">
                <i className="bi bi-people-fill" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-head text-lg font-semibold text-ink-heading">
                  {t.t('guardian.dash.greeting', { name: guardian.displayName })}
                </h2>
                <p className="text-sm text-ink-muted">{t.t('guardian.dash.sub')}</p>
                <p className="mt-1 text-xs font-medium text-primary">
                  {t.t('guardian.dash.children_count', { count: t.digits(children.length) })}
                </p>
              </div>
            </section>

            {children.length === 0 && (
              <Card>
                <EmptyState icon="bi-people" title={t.t('guardian.dash.title')} body={t.t('guardian.no_children')} />
                {helpline !== '' && (
                  <div className="pb-6 text-center">
                    <a
                      href={telHref(helpline)}
                      className="inline-flex items-center gap-2 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white"
                    >
                      <i className="bi bi-telephone" aria-hidden />
                      {formatPhone(helpline)}
                    </a>
                  </div>
                )}
              </Card>
            )}

            <div className={cards.length > 1 ? 'grid gap-6 xl:grid-cols-2' : 'grid gap-6'}>
              {cards.map((card) => (
                <ChildCard key={card.child.id} card={card} month={month} t={t} />
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title={t.t('guardian.dash.notices')}
                  icon="bi-megaphone-fill"
                  actions={
                    <Link href={noticesHref} className="text-sm font-medium text-primary hover:underline">
                      {t.t('guardian.see_all')}
                    </Link>
                  }
                />
                {notices.length === 0 ? (
                  <CardBody>
                    <p className="text-sm text-ink-muted">{t.t('guardian.notices.none')}</p>
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {notices.map((notice) => (
                      <li key={notice.id} className="px-5 py-3">
                        <Link
                          href={`${noticesHref}#notice-${notice.id}`}
                          className="font-medium text-ink hover:text-primary"
                        >
                          {notice.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {t.date(notice.created_at, 'd M Y')} · {excerpt(notice.description, 90)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title={t.t('guardian.dash.contact')} icon="bi-headset" />
                <CardBody className="space-y-3">
                  <p className="text-sm text-ink-muted">{t.t('guardian.dash.contact_body')}</p>
                  {helpline !== '' && (
                    <a
                      href={telHref(helpline)}
                      className="inline-flex items-center gap-2 rounded-orbit border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-soft"
                    >
                      <i className="bi bi-telephone" aria-hidden />
                      {formatPhone(helpline)}
                    </a>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        );
      }}
    </GuardianPage>
  );
}

type CardData = Awaited<ReturnType<typeof childCard>>;

async function childCard(child: GuardianChild, from: Date, to: Date, t: Translator) {
  const [[course, batch], attendance, latest, payments] = await Promise.all([
    childCourse(child, t),
    // Totals only: the card shows figures, not the rows behind them.
    studentAttendanceSummary(child.id, from, to),
    studentPublishedResults(child.id, 1),
    studentPaymentTotals(child.id),
  ]);
  return {
    child,
    course,
    batch,
    attendance,
    latest: latest[0] ?? null,
    due: payments.due,
  };
}

/**
 * Four newest active notices: the shared ones plus those of every child's
 * branches, as the original merges orbit_student_branch_ids() across children.
 */
async function latestNotices(children: GuardianChild[]) {
  const scopes = await Promise.all(children.map((child) => studentScope(child)));
  const branchIds = [...new Set(scopes.flatMap((scope) => scope.branchIds))];
  try {
    return await prisma.notice.findMany({
      where: {
        status: 'active',
        ...(branchIds.length > 0
          ? { OR: [{ branch_id: null }, { branch_id: { in: branchIds } }] }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 4,
      select: { id: true, title: true, description: true, created_at: true },
    });
  } catch {
    return [];
  }
}

function excerpt(text: string | null, length: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length).trimEnd()}…` : flat;
}

function ChildCard({ card, month, t }: { card: CardData; month: string; t: Translator }) {
  const { child, attendance, latest, due } = card;
  const q = `?student=${child.id}`;
  const photo = studentPhotoUrl(child);
  const relation = relationLabel(child.relation, t);
  const rate = attendance.rate;
  const name = t.pick(child, 'name');

  const stat =
    'flex flex-col gap-0.5 rounded-orbit border border-line-soft bg-surface-2/40 px-4 py-3 transition hover:border-primary/40';

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-4">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-2xl font-semibold text-primary">
              {name.trim().charAt(0) || '?'}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-head text-lg font-semibold text-ink-heading">{name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary-text">
                {displayId(child)}
              </span>
              {relation !== '' && (
                <span className="text-ink-muted">{t.t('guardian.dash.relation', { relation })}</span>
              )}
            </div>
            {(card.course !== '' || card.batch !== '') && (
              <p className="mt-1 text-sm text-ink-muted">
                <i className="bi bi-journal-bookmark me-1" aria-hidden />
                {[card.course, card.batch].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Link href={`/guardian/attendance${q}`} className={stat}>
            <span className="text-xs text-ink-muted">
              {t.t('guardian.dash.att_month', { month: t.monthLabel(month) })}
            </span>
            {attendance.total > 0 ? (
              <>
                <span className={`font-head text-xl font-semibold ${rate < 75 ? 'text-red-600' : 'text-ink-heading'}`}>
                  {t.number(rate, Number.isInteger(rate) ? 0 : 1)}%
                </span>
                <span className="text-xs text-ink-muted">
                  {t.t('guardian.dash.att_detail', {
                    present: t.digits(attendance.present + attendance.late),
                    absent: t.digits(attendance.absent),
                    total: t.digits(attendance.total),
                  })}
                </span>
              </>
            ) : (
              <>
                <span className="font-head text-xl font-semibold">—</span>
                <span className="text-xs text-ink-muted">{t.t('guardian.dash.att_none')}</span>
              </>
            )}
          </Link>

          <Link
            href={latest ? `/guardian/marksheet${q}&exam=${latest.exam.id}` : `/guardian/results${q}`}
            className={stat}
          >
            <span className="text-xs text-ink-muted">{t.t('guardian.dash.latest_exam')}</span>
            {latest ? (
              <>
                <span className="font-head text-xl font-semibold text-ink-heading">
                  {latest.result.gpa === null ? '—' : t.number(latest.result.gpa, 2)}{' '}
                  <small className="text-sm">{latest.result.grade}</small>
                </span>
                <span className="text-xs text-ink-muted">
                  {t.pick(latest.exam, 'title')} · {t.monthLabel(latest.exam.exam_month)}
                  {latest.result.hasPosition && latest.result.position
                    ? ` · ${t.t('result.position_of', {
                        position: t.digits(latest.result.position),
                        total: t.digits(latest.stats.complete),
                      })}`
                    : ''}
                </span>
              </>
            ) : (
              <>
                <span className="font-head text-xl font-semibold">—</span>
                <span className="text-xs text-ink-muted">{t.t('guardian.dash.no_result')}</span>
              </>
            )}
          </Link>

          <Link href={`/guardian/payments${q}`} className={stat}>
            <span className="text-xs text-ink-muted">{t.t('guardian.dash.total_due')}</span>
            <span className={`font-head text-xl font-semibold ${due > 0 ? 'text-red-600' : 'text-ink-heading'}`}>
              {t.money(due)}
            </span>
            <span className="text-xs text-ink-muted">
              {t.t(due > 0 ? 'guardian.pay.status_due' : 'guardian.pay.status_clear')}
            </span>
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3 text-sm">
          {[
            ['attendance', 'bi-calendar-check', 'guardian.nav.attendance'],
            ['results', 'bi-award', 'guardian.nav.results'],
            ['payments', 'bi-wallet2', 'guardian.nav.payments'],
            ['notices', 'bi-megaphone', 'guardian.nav.notices'],
          ].map(([section, icon, label]) => (
            <Link
              key={section}
              href={`/guardian/${section}${q}`}
              className="inline-flex items-center gap-1.5 rounded-orbit px-2.5 py-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <i className={`bi ${icon}`} aria-hidden />
              {t.t(label)}
            </Link>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
