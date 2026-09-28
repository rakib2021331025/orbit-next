import type { Metadata } from 'next';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits, type Lang } from '@/lib/i18n/format';
import { prisma } from '@/lib/db/prisma';
import { backupDirWritable, backupList, backupTables, uploadFolders } from '@/lib/backup/dump';
import { CreateBackupForm, DeleteBackup, PruneBackups } from './BackupForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'bak.title'),
    robots: { index: false, follow: false },
  };
}

/** "1.2 MB" in the reader's digits. */
function formatBytes(bytes: number, lang: Lang): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${toLocalDigits(text, lang)} ${units[unit]}`;
}

/**
 * Database backup, from admin/backup.php.
 *
 * The warning at the top is not decoration: a dump holds every student's
 * details, phone numbers and payment records, and the files have no public URL
 * precisely so nobody can stumble onto one.
 *
 * Uploaded files are **not** in a database backup, and the page says how to copy
 * them separately.
 */
export default async function AdminBackupPage() {
  return (
    <AdminPage active="backup" route="/admin/backup" title="">
      {async ({ t }) => {
        const [tables, backups, writable] = await Promise.all([
          backupTables(),
          backupList(),
          backupDirWritable(),
        ]);

        const dbSize = tables.reduce((sum, table) => sum + table.bytes, 0);
        const stored = backups.filter((entry) => entry.status === 'success' && entry.exists);
        const storedSize = stored.reduce((sum, entry) => sum + entry.actualSize, 0);
        const last = stored[0] ?? null;

        // The admins who made them, for the "By …" line.
        const adminIds = [
          ...new Set(backups.map((entry) => entry.createdBy).filter((id): id is number => !!id)),
        ];
        const admins =
          adminIds.length > 0
            ? await prisma.admin
                .findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })
                .catch(() => [])
            : [];
        const adminById = new Map(admins.map((admin) => [admin.id, admin.email]));

        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-ink-heading">{t.t('bak.title')}</h1>
              <p className="mt-1 text-sm text-ink-muted">{t.t('bak.sub')}</p>
            </div>

            <Alert tone="warning">
              <p className="font-semibold">{t.t('bak.warning')}</p>
              <p className="mt-1 text-sm">{t.t('bak.warning_detail')}</p>
            </Alert>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {formatBytes(dbSize, t.lang)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('bak.stat_db_size')}</span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(tables.length)}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('bak.stat_tables')}</span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-xl font-bold text-ink-heading">
                  {t.digits(stored.length)}
                </span>
                <span className="block text-sm text-ink-muted">
                  {t.t('bak.stat_stored')} ·{' '}
                  {t.t('bak.stat_stored_sub', { size: formatBytes(storedSize, t.lang) })}
                </span>
              </div>
              <div className="rounded-orbit border border-line bg-surface p-4">
                <span className="block text-base font-bold text-ink-heading">
                  {last ? t.date(last.createdAt, 'd M Y, h:i A') : t.t('bak.stat_never')}
                </span>
                <span className="block text-sm text-ink-muted">{t.t('bak.stat_last')}</span>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader title={t.t('bak.create_title')} icon="bi-database-down" />
                <CardBody>
                  <CreateBackupForm
                    tables={tables.map((table) => ({
                      name: table.name,
                      rows: t.t('bak.table_rows', { count: t.digits(table.rows) }),
                      size: formatBytes(table.bytes, t.lang),
                    }))}
                    writable={writable}
                    labels={{
                      createTitle: t.t('bak.create_title'),
                      scopeFull: t.t('bak.scope_full'),
                      scopeFullHint: t.t('bak.scope_full_hint', { count: '{count}' }),
                      scopeSelected: t.t('bak.scope_selected'),
                      scopeSelectedHint: t.t('bak.scope_selected_hint'),
                      selectAll: t.t('bak.select_all'),
                      selectNone: t.t('bak.select_none'),
                      create: t.t('bak.create_btn'),
                      creating: t.t('bak.creating'),
                      notWritable: t.t('bak.not_writable'),
                    }}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t.t('bak.files_title')} icon="bi-folder2-open" />
                <CardBody className="space-y-2 text-sm">
                  <p className="text-ink-muted">{t.t('bak.files_note')}</p>
                  <p className="text-ink">{t.t('bak.files_intro')}</p>
                  <ul className="list-inside list-disc font-mono text-xs text-ink-muted">
                    {uploadFolders().map((folder) => (
                      <li key={folder}>{folder}</li>
                    ))}
                  </ul>
                  <ol className="list-inside list-decimal space-y-1 text-xs text-ink-muted">
                    <li>{t.t('bak.files_step1')}</li>
                    <li>{t.t('bak.files_step2')}</li>
                    <li>{t.t('bak.files_step3')}</li>
                    <li>{t.t('bak.files_step4')}</li>
                  </ol>
                  <p className="text-xs text-ink-muted">{t.t('bak.files_doc')}</p>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader title={t.t('bak.list_title')} icon="bi-archive" />

              {backups.length === 0 ? (
                <EmptyState icon="bi-archive" title={t.t('bak.list_empty')} body={t.t('bak.sub')} />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {backups.map((entry) => (
                    <li key={entry.filename} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <code className="break-all text-sm text-ink">{entry.filename}</code>
                            <Badge
                              tone={
                                entry.status !== 'success'
                                  ? 'danger'
                                  : entry.exists
                                    ? 'success'
                                    : 'warning'
                              }
                            >
                              {t.t(
                                entry.status !== 'success'
                                  ? 'bak.status_failed'
                                  : entry.exists
                                    ? 'bak.status_success'
                                    : 'bak.status_missing'
                              )}
                            </Badge>
                          </p>

                          <p className="mt-1 text-xs text-ink-muted">
                            {[
                              t.date(entry.createdAt, 'd M Y, h:i A'),
                              formatBytes(entry.exists ? entry.actualSize : entry.size, t.lang),
                              entry.id !== null
                                ? t.t('bak.contents', {
                                    scope: t.t(
                                      entry.scope === 'selected'
                                        ? 'bak.scope_label_selected'
                                        : 'bak.scope_label_full'
                                    ),
                                    tables: t.digits(entry.tables),
                                    rows: t.digits(entry.rows),
                                  })
                                : t.t('bak.contents_found'),
                              entry.createdBy !== null && adminById.has(entry.createdBy)
                                ? t.t('bak.by', { email: adminById.get(entry.createdBy)! })
                                : '',
                              entry.dbSize > 0
                                ? t.t('bak.db_size_then', { size: formatBytes(entry.dbSize, t.lang) })
                                : '',
                            ]
                              .filter((part) => part !== '')
                              .join(' · ')}
                          </p>

                          {entry.error !== '' && (
                            <p className="mt-1 text-xs text-red-600">{entry.error}</p>
                          )}
                        </div>

                        <span className="flex flex-wrap items-center gap-1.5">
                          {entry.exists && (
                            <a
                              href={`/api/admin/backup?file=${encodeURIComponent(entry.filename)}`}
                              className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                            >
                              <i className="bi bi-download me-1" aria-hidden />
                              {t.t('bak.download')}
                            </a>
                          )}
                          <DeleteBackup
                            filename={entry.filename}
                            labels={{
                              remove: t.t('bak.delete'),
                              confirm: t.t('bak.delete_confirm'),
                              cancel: t.t('common.cancel'),
                            }}
                          />
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <CardBody>
                <PruneBackups
                  labels={{
                    label: t.t('bak.prune_label'),
                    days7: t.t('bak.prune_days', { count: t.digits(7) }),
                    days30: t.t('bak.prune_days', { count: t.digits(30) }),
                    days90: t.t('bak.prune_days', { count: t.digits(90) }),
                    prune: t.t('bak.prune_btn'),
                    confirm: t.t('bak.prune_confirm'),
                    cancel: t.t('common.cancel'),
                    hint: t.t('bak.prune_hint'),
                  }}
                />
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
