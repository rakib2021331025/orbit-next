/**
 * Where a notification's stored link goes — orbit_teacher_link() and its
 * student and guardian twins.
 *
 * Notifications keep their link as text, so rows written by the PHP app are
 * still in the database after the cutover and still say `evaluate.php?attempt=7`.
 * Those are translated to the new paths here rather than left to 404, and
 * anything unrecognised falls back to the portal's own notification page, which
 * is what the original does with its `$fallback`.
 *
 * Everything else is refused: a stored link is data, and data that arrives as
 * `javascript:` or as another site's URL must never become an href the portal
 * follows on its own.
 */

export type Portal = 'teacher' | 'student' | 'guardian' | 'admin';

const TEACHER_PAGES: Record<string, string> = {
  'dashboard.php': '/teacher',
  'notifications.php': '/teacher/notifications',
  'live_classes.php': '/teacher/live-classes',
  'exams.php': '/teacher/exams',
  'evaluations.php': '/teacher/evaluations',
};

const STUDENT_PAGES: Record<string, string> = {
  'dashboard.php': '/student',
  'notifications.php': '/student/notices',
  'live_classes.php': '/student/live-classes',
  'exams.php': '/student/exams',
  'results.php': '/student/results',
  'materials.php': '/student/materials',
  'assignments.php': '/student/assignments',
  'recordings.php': '/student/recordings',
  'notices.php': '/student/notices',
  'payments.php': '/student/payments',
  'routine.php': '/student/routine',
  'attendance.php': '/student/attendance',
};

const HOME: Record<Portal, string> = {
  teacher: '/teacher/notifications',
  student: '/student/notices',
  guardian: '/guardian',
  admin: '/admin',
};

export interface ResolvedLink {
  href: string;
  /** True for an http(s) address elsewhere, which opens in a new tab. */
  external: boolean;
}

export function notificationLink(raw: unknown, portal: Portal): ResolvedLink | null {
  const link = String(raw ?? '').trim();
  if (link === '') return null;

  // Control characters, quotes and backslashes have no place in a URL and are
  // how a stored link tries to break out of the attribute it lands in.
  if (/[\u0000- "'<>\\`]/.test(link)) return null;

  if (/^https?:\/\//i.test(link)) {
    try {
      new URL(link);
      return { href: link, external: true };
    } catch {
      return null;
    }
  }

  // A protocol-relative URL or any other scheme (javascript:, data:).
  if (link.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(link)) return null;

  // Already a path in the new app.
  if (link.startsWith('/') || link.startsWith('#')) return { href: link, external: false };

  // A legacy `page.php?query` link. Leading `../` hops are stripped the way the
  // original strips them before looking the page up.
  const cleaned = link.replace(/^(\.\.\/)+/, '').replace(/^(teacher|student|guardian|admin)\//, '');
  const [page, query = ''] = cleaned.split('?', 2);

  if (portal === 'teacher') {
    // The one link that carries an id: evaluate.php?attempt=<id>.
    const attempt = /(?:^|&)attempt=(\d+)/.exec(query);
    if (page === 'evaluate.php' && attempt) {
      return { href: `/teacher/evaluate/${attempt[1]}`, external: false };
    }
    const mapped = TEACHER_PAGES[page];
    if (mapped) return { href: mapped, external: false };
  }

  if (portal === 'student') {
    const mapped = STUDENT_PAGES[page];
    if (mapped) return { href: mapped, external: false };
  }

  return { href: HOME[portal], external: false };
}

/** A Bootstrap icon class from a stored icon name ("bell", "bi-bell"). */
export function notificationIcon(icon: unknown, fallback = 'bell'): string {
  const cleaned = String(icon ?? '')
    .trim()
    .replace(/^(bi\s+)?bi-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return `bi-${cleaned !== '' ? cleaned : fallback}`;
}
