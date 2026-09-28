'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { createBackup, deleteBackup, pruneBackups } from '@/lib/backup/dump';

/**
 * Backup actions, from admin/backup.php.
 *
 * Creating a dump can take a while on a big database, which is why the page
 * shows a working state and the action returns the file name and size when it
 * is done rather than redirecting silently.
 */

export interface BackupState {
  error: string;
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/backup');
}

/** "1.2 MB" in the reader's digits. */
function formatBytes(bytes: number, lang: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${toLocalDigits(text, lang as 'en' | 'bn')} ${units[unit]}`;
}

export async function createBackupAction(
  _prev: BackupState,
  formData: FormData
): Promise<BackupState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const scope = formData.get('scope') === 'selected' ? 'selected' : 'full';
  const tables =
    scope === 'selected'
      ? formData
          .getAll('tables')
          .map((value) => String(value))
          .filter((value) => value !== '')
      : null;

  if (scope === 'selected' && (tables === null || tables.length === 0)) {
    return { error: translate(lang, 'bak.err_no_tables'), message: '' };
  }

  const result = await createBackup(tables, admin.id);
  refresh();

  if (!result.ok) {
    const known = ['no_tables', 'not_writable', 'write_failed'];
    return {
      error: translate(lang, `bak.err_${known.includes(result.error) ? result.error : 'failed'}`),
      message: '',
    };
  }

  return {
    error: '',
    message: translate(lang, 'bak.created', {
      file: result.filename,
      size: formatBytes(result.size, lang),
    }),
  };
}

export async function deleteBackupAction(
  _prev: BackupState,
  formData: FormData
): Promise<BackupState> {
  await requireAdmin();
  const lang = await getLang();

  const ok = await deleteBackup(String(formData.get('file') ?? ''));
  refresh();

  return ok
    ? { error: '', message: translate(lang, 'bak.deleted') }
    : { error: translate(lang, 'bak.delete_failed'), message: '' };
}

export async function pruneBackupsAction(
  _prev: BackupState,
  formData: FormData
): Promise<BackupState> {
  await requireAdmin();
  const lang = await getLang();

  const asked = Number(formData.get('days') ?? 0);
  const days = [7, 30, 90].includes(asked) ? asked : 30;

  // Always keeps the newest good backup, whatever the age asked for.
  const removed = await pruneBackups(days, 1);
  refresh();

  return {
    error: '',
    message: translate(lang, 'bak.pruned', { count: toLocalDigits(removed, lang) }),
  };
}
