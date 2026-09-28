'use server';

import { prisma } from '@/lib/db/prisma';
import { getTranslator } from '@/lib/i18n';
import { throttleStatus, throttleHit, clientIp } from '@/lib/security/throttle';
import { emptyFeedbackState } from './state';

export interface FeedbackState {
  done: boolean;
  error: string;
  values: { name: string; course_name: string; rating: string; feedback: string };
}


/**
 * A student review, from submit_feedback.php.
 *
 * Saved as `pending`: nothing a stranger types appears on the home page until an
 * admin approves it. That is the original's behaviour and the only sane default
 * for a form open to the internet.
 *
 * The original had no rate limit here, which left the table open to being filled
 * by a script. Since the same throttle helper already exists, this adds one per
 * IP — five an hour is far above what a real person needs and far below what a
 * bot wants.
 */
export async function feedbackAction(
  _prev: FeedbackState,
  formData: FormData
): Promise<FeedbackState> {
  const { t } = await getTranslator();

  const values = {
    name: String(formData.get('name') ?? '').trim().slice(0, 100),
    course_name: String(formData.get('course_name') ?? '').trim().slice(0, 150),
    rating: String(formData.get('rating') ?? ''),
    feedback: String(formData.get('feedback') ?? '').trim().slice(0, 2000),
  };

  const rating = Number(values.rating);

  if (
    values.name === '' ||
    values.course_name === '' ||
    values.feedback === '' ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return { done: false, error: t('home.feedback_error'), values };
  }

  const ip = await clientIp();
  const throttle = await throttleStatus('feedback', ip, 5, 20, 60);
  if (throttle.locked) {
    return { done: false, error: t('inquiry.err_throttle'), values };
  }

  try {
    await prisma.feedback.create({
      data: {
        name: values.name,
        course_name: values.course_name,
        rating,
        feedback: values.feedback,
        status: 'pending',
      },
    });
    await throttleHit('feedback', ip);
    return { done: true, error: '', values: emptyFeedbackState.values };
  } catch {
    // Requires database configuration.
    return { done: false, error: t('home.feedback_error'), values };
  }
}
