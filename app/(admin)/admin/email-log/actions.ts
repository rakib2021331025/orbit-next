'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';

/**
 * Clearing old email log entries, from admin/email_log.php.
 *
 * Only the three offered ages are accepted; a hand-made request asking for
 * "older than 0 days" would empty the log, which is exactly the accident this
 * guard exists to prevent.
 */

export interface PruneState {
  error: string;
  message: string;
}

const AGES = [30, 90, 180];

export async function pruneLogAction(
  _prev: PruneState,
  formData: FormData
): Promise<PruneState> {
  await requireAdmin();
  const lang = await getLang();

  const asked = Number(formData.get('days') ?? 0);
  const days = AGES.includes(asked) ? asked : 90;
  const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const removed = await prisma.emailLog.deleteMany({ where: { created_at: { lt: before } } });
    revalidatePath('/admin/email-log');
    return {
      error: '',
      message: translate(lang, 'elog.pruned', { count: toLocalDigits(removed.count, lang) }),
    };
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }
}
