import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { uploadUrl } from '@/lib/storage/url';
import { trialThumbFallback, trialVideoLink } from '@/lib/trials/video';
import { DeleteTrial, TrialForm, TrialToggle } from './TrialForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'atrial.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Trial classes, from admin/trial_classes.php.
 *
 * Only active rows are public. The thumbnail falls back to YouTube's own still,
 * so a class always has a picture even before one is uploaded — which is also
 * why the upload is required on a new class rather than on every save.
 */
export default async function AdminTrialClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="trial_classes" route="/admin/trial-classes" title="">
      {async ({ t }) => {
        const filter =
          params.status === 'active' || params.status === 'inactive' ? params.status : '';

        const rows = await prisma.trialClass
          .findMany({
            where: filter !== '' ? { status: filter } : {},
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          })
          .catch(() => []);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.trialClass.findUnique({ where: { id: editId } }).catch(() => null)
            : null;
        const missing = editId > 0 && editing === null;

        const listUrl = `/admin/trial-classes${filter !== '' ? `?status=${filter}` : ''}`;
        const editUrl = (id: number) => {
          const query = new URLSearchParams();
          if (filter !== '') query.set('status', filter);
          query.set('edit', String(id));
          return `/admin/trial-classes?${query}#trialForm`;
        };

        const tabs: { key: string; label: string }[] = [
          { key: '', label: t.t('common.all') },
          { key: 'active', label: t.t('status.active') },
          { key: 'inactive', label: t.t('status.inactive') },
        ];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('atrial.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('atrial.sub')}</p>
              </div>
              <a
                href="/trial-classes"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                <i className="bi bi-box-arrow-up-right me-1" aria-hidden />
                {t.t('atrial.view_site')}
              </a>
            </div>

            {missing && <Alert tone="warning">{t.t('atrial.not_found')}</Alert>}

            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={
                    tab.key === ''
                      ? '/admin/trial-classes'
                      : `/admin/trial-classes?status=${tab.key}`
                  }
                  aria-current={filter === tab.key ? 'page' : undefined}
                  className={`rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                    filter === tab.key
                      ? 'bg-primary text-white'
                      : 'border border-line text-ink hover:bg-surface-2'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-1">
                <Card>
                  <CardHeader
                    title={t.t(editing ? 'atrial.edit' : 'atrial.new')}
                    icon="bi-play-btn"
                  />
                  <CardBody>
                    <TrialForm
                      values={{
                        id: editing?.id ?? 0,
                        title: editing?.title ?? '',
                        teacher: editing?.teacher_name ?? '',
                        course: editing?.course_name ?? '',
                        description: editing?.description ?? '',
                        videoLink: trialVideoLink(editing?.video_url),
                        status: editing?.status ?? 'active',
                        thumbUrl: editing?.thumbnail ? uploadUrl(editing.thumbnail) : '',
                      }}
                      cancelHref={listUrl}
                      labels={{
                        title: t.t('atrial.f_title'),
                        teacher: t.t('atrial.f_teacher'),
                        course: t.t('atrial.f_course'),
                        description: t.t('atrial.f_desc'),
                        video: t.t('atrial.f_video'),
                        videoHelp: t.t('atrial.f_video_help'),
                        thumb: t.t('atrial.f_thumb'),
                        thumbHelp: t.t('atrial.f_thumb_help'),
                        thumbKeep: t.t('atrial.f_thumb_keep'),
                        currentThumb: t.t('atrial.current_thumb'),
                        status: t.t('common.status'),
                        statusActive: t.t('status.active'),
                        statusInactive: t.t('status.inactive'),
                        statusHelp: t.t('atrial.f_status_help'),
                        save: t.t('atrial.save'),
                        saving: t.t('common.please_wait'),
                        cancelEdit: t.t('atrial.cancel_edit'),
                      }}
                    />
                  </CardBody>
                </Card>
              </div>

              <div className="xl:col-span-2">
                <Card>
                  <CardHeader title={t.t('atrial.col_class')} icon="bi-collection-play" />

                  {rows.length === 0 ? (
                    <EmptyState
                      icon="bi-play-btn"
                      title={t.t(filter !== '' ? 'atrial.none_filtered' : 'atrial.none')}
                      body={t.t('atrial.sub')}
                    />
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {rows.map((row) => {
                        const videoId = (row.video_url ?? '').trim();
                        const thumb =
                          row.thumbnail !== null && row.thumbnail !== ''
                            ? uploadUrl(row.thumbnail)
                            : trialThumbFallback(videoId);
                        const active = row.status === 'active';

                        return (
                          <li key={row.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                            {thumb !== '' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="h-16 w-28 shrink-0 rounded-orbit bg-surface-2 object-cover"
                              />
                            ) : (
                              <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded-orbit bg-surface-2 text-ink-muted">
                                <i className="bi bi-play-btn" aria-hidden />
                              </span>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-ink-heading">{row.title}</span>
                                <Badge tone={active ? 'success' : 'neutral'}>
                                  {t.t(active ? 'status.active' : 'status.inactive')}
                                </Badge>
                              </p>

                              <p className="mt-0.5 text-xs text-ink-muted">
                                {[row.teacher_name, row.course_name]
                                  .filter((part) => (part ?? '') !== '')
                                  .join(' · ')}
                              </p>

                              <p className="mt-1 text-xs text-ink-muted">
                                {t.t('atrial.col_added')}: {t.date(row.created_at, 'd M Y')}
                              </p>

                              {videoId !== '' ? (
                                <a
                                  href={`https://www.youtube.com/watch?v=${videoId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-block text-xs text-primary hover:underline"
                                >
                                  <i className="bi bi-youtube me-1" aria-hidden />
                                  {t.t('atrial.watch')}
                                </a>
                              ) : (
                                <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                                  {t.t('atrial.no_video')}
                                </span>
                              )}
                            </div>

                            <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                              <TrialToggle
                                trialId={row.id}
                                isActive={active}
                                labels={{
                                  activate: t.t('atrial.activate'),
                                  deactivate: t.t('atrial.deactivate'),
                                }}
                              />
                              <Link
                                href={editUrl(row.id)}
                                title={t.t('common.edit')}
                                aria-label={t.t('common.edit')}
                                className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                              >
                                <i className="bi bi-pencil" aria-hidden />
                              </Link>
                              <DeleteTrial
                                trialId={row.id}
                                labels={{
                                  remove: t.t('common.delete'),
                                  confirm: t.t('atrial.delete_confirm'),
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
