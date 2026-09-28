'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { emptyReviewState } from './state';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Review moderation, from the POST block of admin/index.php.
 *
 * The dashboard is the only place a student review is approved for the public
 * website, so these three actions are the gate between a submitted review and
 * something visible to visitors. Approving is deliberate; hiding puts a review
 * back to pending rather than deleting it.
 */

export interface ReviewState {
  error: string;
  message: string;
}


export async function moderateReviewAction(
  _prev: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  // Any active admin may moderate; the dashboard is not a super-admin page.
  await requireAdmin();

  const id = Number(formData.get('id') ?? 0);
  const action = String(formData.get('action') ?? '');
  const lang = await getLang();

  if (!Number.isInteger(id) || id <= 0) return emptyReviewState;

  try {
    if (action === 'approve_review') {
      await prisma.feedback.update({ where: { id }, data: { status: 'approved' } });
    } else if (action === 'hide_review') {
      // Back to pending, not deleted: hiding is reversible.
      await prisma.feedback.update({ where: { id }, data: { status: 'pending' } });
    } else if (action === 'delete_review') {
      await prisma.feedback.delete({ where: { id } });
    } else {
      return emptyReviewState;
    }
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  revalidatePath('/admin');

  invalidate(TAGS.home);
  // The public pages show approved reviews, so their cache has to go too.
  revalidatePath('/');
  revalidatePath('/feedback');

  const key =
    action === 'approve_review'
      ? 'adash.review_approved'
      : action === 'hide_review'
        ? 'adash.review_hidden'
        : 'adash.review_deleted';

  return { error: '', message: translate(lang, key) };
}
