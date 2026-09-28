import type { Metadata } from 'next';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { mailDriver, mailIsConfigured } from '@/lib/email/send';
import { storageDriver } from '@/lib/storage/store';
import { geminiAvailable } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'admin.nav.system'),
    robots: { index: false, follow: false },
  };
}

type State = 'ok' | 'warn' | 'off';

interface Check {
  label: string;
  value: string;
  state: State;
  note?: string;
}

/**
 * What this server can actually do, in the spirit of tools/serv00_check.php.
 *
 * The original reports on PHP: OPcache, APCu, extensions, Apache modules. None
 * of that exists here, so the **questions** are carried over rather than the
 * checks: which runtime is this, does the database answer and how fast, can
 * anything be written to disk, and which optional services are configured.
 *
 * Read-only apart from one temporary file, which is deleted again — that is the
 * only way to answer "can this host write" truthfully.
 */
export default async function SystemCheckPage() {
  return (
    <AdminPage active="settings" route="/admin/tools/system-check" level="super" title="">
      {async ({ t }) => {
        /* ------------------------------------------------- the database */
        const started = Date.now();
        let dbVersion = '';
        let dbError = '';
        try {
          const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT version() AS version`;
          dbVersion = rows[0]?.version ?? '';
        } catch (error) {
          dbError = error instanceof Error ? error.message : 'unknown error';
        }
        const dbLatency = Date.now() - started;

        // Whether the schema is really there, not just whether the server is up.
        let students = -1;
        try {
          students = await prisma.student.count();
        } catch {
          students = -1;
        }

        /* ------------------------------------------------ writable disk */
        let writable = false;
        let writePath = '';
        try {
          writePath = process.env.ORBIT_BACKUP_DIR ?? path.join(os.tmpdir(), 'orbit-check');
          await mkdir(writePath, { recursive: true });
          const probe = path.join(writePath, `.write-${randomBytes(4).toString('hex')}`);
          await writeFile(probe, 'ok');
          await unlink(probe);
          writable = true;
        } catch {
          writable = false;
        }

        const memory = process.memoryUsage();
        const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;

        const runtime: Check[] = [
          { label: 'Node', value: process.version, state: 'ok' },
          { label: 'Platform', value: `${process.platform} ${process.arch}`, state: 'ok' },
          {
            label: 'Environment',
            value: process.env.NODE_ENV ?? 'development',
            state: process.env.NODE_ENV === 'production' ? 'ok' : 'warn',
            note: process.env.NODE_ENV === 'production' ? '' : 'not a production build',
          },
          {
            label: 'Region',
            value: process.env.VERCEL_REGION ?? os.hostname(),
            state: 'ok',
          },
          { label: 'Heap in use', value: mb(memory.heapUsed), state: 'ok' },
          { label: 'RSS', value: mb(memory.rss), state: 'ok' },
          {
            label: 'CPU cores',
            value: String(os.cpus().length),
            state: 'ok',
          },
        ];

        const database: Check[] = [
          {
            label: 'Connection',
            value: dbError === '' ? 'OK' : 'FAILED',
            state: dbError === '' ? 'ok' : 'off',
            note: dbError,
          },
          { label: 'Server', value: dbVersion !== '' ? dbVersion.split(' ').slice(0, 2).join(' ') : '—', state: dbVersion !== '' ? 'ok' : 'off' },
          {
            label: 'Round trip',
            value: `${dbLatency} ms`,
            state: dbLatency < 400 ? 'ok' : 'warn',
            note: dbLatency < 400 ? '' : 'slow — check the region of the database',
          },
          {
            label: 'Schema',
            value: students >= 0 ? `readable (${students} students)` : 'NOT readable',
            state: students >= 0 ? 'ok' : 'off',
            note: students >= 0 ? '' : 'run prisma migrate deploy',
          },
        ];

        const services: Check[] = [
          {
            label: 'Email',
            value: mailIsConfigured() ? `configured (${mailDriver()})` : `not configured (${mailDriver()})`,
            state: mailIsConfigured() ? 'ok' : 'warn',
            note: mailIsConfigured() ? '' : t.t('set.mail_status_off'),
          },
          {
            label: 'File storage',
            value: storageDriver(),
            state: 'ok',
            note: storageDriver() === 'local' ? 'local disk — not shared between instances' : '',
          },
          {
            label: 'Writable folder',
            value: writable ? 'yes' : 'no',
            state: writable ? 'ok' : 'warn',
            note: writePath,
          },
          {
            label: 'Academic AI key',
            value: geminiAvailable() ? 'present' : 'missing',
            state: geminiAvailable() ? 'ok' : 'off',
            note: geminiAvailable() ? '' : 'ORBIT_GEMINI_API_KEY',
          },
          {
            label: 'Session secret',
            value: (process.env.AUTH_SECRET ?? '').length >= 32 ? 'set' : 'WEAK or missing',
            state: (process.env.AUTH_SECRET ?? '').length >= 32 ? 'ok' : 'off',
            note: (process.env.AUTH_SECRET ?? '').length >= 32 ? '' : 'AUTH_SECRET must be 32+ characters',
          },
          {
            label: 'Site URL',
            value: process.env.NEXT_PUBLIC_SITE_URL ?? '—',
            state: (process.env.NEXT_PUBLIC_SITE_URL ?? '') !== '' ? 'ok' : 'warn',
            note:
              (process.env.NEXT_PUBLIC_SITE_URL ?? '') !== ''
                ? ''
                : 'links in emails need an absolute address',
          },
        ];

        const tone = (state: State) =>
          state === 'ok' ? 'success' : state === 'warn' ? 'warning' : 'danger';

        const block = (title: string, icon: string, checks: Check[]) => (
          <Card key={title}>
            <CardHeader title={title} icon={icon} />
            <CardBody>
              <dl className="divide-y divide-line-soft text-sm">
                {checks.map((check) => (
                  <div key={check.label} className="flex flex-wrap items-center gap-2 py-2">
                    <dt className="w-44 shrink-0 text-ink-muted">{check.label}</dt>
                    <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <Badge tone={tone(check.state)}>{check.value}</Badge>
                      {(check.note ?? '') !== '' && (
                        <span className="min-w-0 break-words text-xs text-ink-muted">
                          {check.note}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        );

        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-ink-heading">
                {t.t('admin.nav.system')}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {t.t('common.details')} · {new Date().toISOString()}
              </p>
            </div>

            {block('Runtime', 'bi-cpu', runtime)}
            {block('Database', 'bi-database', database)}
            {block('Services', 'bi-plug', services)}

            <Card>
              <CardBody className="text-xs text-ink-muted">
                Read-only. One temporary file is written and deleted again, which is the only way
                to answer whether this host can write at all.
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
