'use server';

import { prisma } from '@/lib/db/prisma';
import { requireStudent } from '@/lib/auth/guards';

/**
 * Marks this student's unread notifications as read.
 *
 * The guard runs first and the update is keyed to the session's own id, so this
 * can only ever clear the caller's own notifications — there is no id parameter
 * to tamper with.
 */
export async function markNotificationsRead(): Promise<void> {
  const student = await requireStudent();
  try {
    await prisma.notification.updateMany({
      where: { user_type: 'student', user_id: student.id, is_read: false },
      data: { is_read: true },
    });
  } catch {
    // Requires database configuration; a badge that stays lit is not worth an error.
  }
}
