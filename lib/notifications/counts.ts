import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { settingFlag } from '@/lib/settings';

/**
 * Unread counts and the small queries the portal chrome needs.
 *
 * Every one of these returns a number on failure rather than throwing: they feed
 * a badge, and a page must not fail to render because a pill could not be
 * counted. That is the original's behaviour in orbit_student_unread_count() and
 * the teacher header's pending query, both of which swallow the error and use 0.
 */

export type UserType = 'admin' | 'teacher' | 'student' | 'guardian';

export async function unreadCount(userType: UserType, userId: number): Promise<number> {
  try {
    return await prisma.notification.count({
      where: { user_type: userType, user_id: userId, is_read: false },
    });
  } catch {
    return 0;
  }
}

/** Attempts waiting for this teacher to mark, on their own exams only. */
export async function teacherPendingEvaluations(teacherId: number): Promise<number> {
  try {
    return await prisma.examAttempt.count({
      where: { status: 'submitted', exam: { teacher_id: teacherId } },
    });
  } catch {
    return 0;
  }
}

export interface NotificationRow {
  id: number;
  title: string;
  message: string | null;
  link: string | null;
  icon: string | null;
  is_read: boolean;
  created_at: Date;
}

export async function recentNotifications(
  userType: UserType,
  userId: number,
  take = 5
): Promise<NotificationRow[]> {
  try {
    return await prisma.notification.findMany({
      where: { user_type: userType, user_id: userId },
      orderBy: { created_at: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        message: true,
        link: true,
        icon: true,
        is_read: true,
        created_at: true,
      },
    });
  } catch {
    return [];
  }
}

/**
 * Whether Orbit Academic AI can answer at all: switched on by an admin AND
 * holding a real key.
 *
 * Both halves matter. The setting alone would put a menu entry in front of every
 * student on an install with no key, and every question would fail.
 */
export async function aiAvailable(): Promise<boolean> {
  try {
    // From the cached settings map (lib/settings), not a query of its own: this
    // runs on every student page. The setting is the string '1'.
    if (!(await settingFlag('academic_ai_enabled', false))) return false;

    // The key lives in the environment here, not in site_settings: a setting is
    // editable by any admin, and an API key that spends money should not be.
    const key = (process.env.ORBIT_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '').trim();
    return key !== '' && key !== 'YOUR_GEMINI_API_KEY';
  } catch {
    return false;
  }
}
