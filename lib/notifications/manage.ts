import 'server-only';
import { prisma } from '@/lib/db/prisma';
import type { UserType } from './counts';

/**
 * Changing one's own notifications, from the POST block of
 * teacher/notifications.php (and the student and guardian twins).
 *
 * **`user_type` and `user_id` are part of every WHERE**, never a check made
 * first and a write made second. That is the original's own comment, and it is
 * what stops one teacher marking or deleting another's rows by putting a
 * different id in the form.
 */

export interface NotificationOutcome {
  ok: boolean;
  /** A translation key. */
  message: string;
  vars?: Record<string, string | number>;
  /** Where an `open` should go once the row is marked read. */
  link?: string | null;
}

export async function markAllRead(
  userType: UserType,
  userId: number
): Promise<NotificationOutcome> {
  try {
    await prisma.notification.updateMany({
      where: { user_type: userType, user_id: userId, is_read: false },
      data: { is_read: true },
    });
    return { ok: true, message: 'tch.notif.marked_all' };
  } catch {
    return { ok: false, message: 'error.generic' };
  }
}

/**
 * Marks one notification read and returns its stored link.
 *
 * The link comes back rather than being followed here, because where it may go
 * is a decision about this portal — see `notificationLink()`.
 */
export async function markOneRead(
  userType: UserType,
  userId: number,
  notificationId: number
): Promise<NotificationOutcome> {
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return { ok: false, message: 'tch.notif.not_found' };
  }

  try {
    const row = await prisma.notification.findFirst({
      where: { id: notificationId, user_type: userType, user_id: userId },
      select: { id: true, link: true },
    });
    if (!row) return { ok: false, message: 'tch.notif.not_found' };

    await prisma.notification.update({ where: { id: row.id }, data: { is_read: true } });
    return { ok: true, message: 'tch.notif.marked_one', link: row.link };
  } catch {
    return { ok: false, message: 'error.generic' };
  }
}

/**
 * Deletes the read ones.
 *
 * Only the read ones: an unread notification is something the person has not
 * seen yet, and "clear" must never be a way to lose it.
 */
export async function clearRead(userType: UserType, userId: number): Promise<NotificationOutcome> {
  try {
    const removed = await prisma.notification.deleteMany({
      where: { user_type: userType, user_id: userId, is_read: true },
    });
    return removed.count > 0
      ? { ok: true, message: 'tch.notif.cleared', vars: { count: removed.count } }
      : { ok: true, message: 'tch.notif.nothing_cleared' };
  } catch {
    return { ok: false, message: 'error.generic' };
  }
}

/** How many of this person's notifications have been read, for the clear button. */
export async function readCount(userType: UserType, userId: number): Promise<number> {
  try {
    return await prisma.notification.count({
      where: { user_type: userType, user_id: userId, is_read: true },
    });
  } catch {
    return 0;
  }
}
