import { hasTranslation, translate, type Lang } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';

/**
 * A readable name for a stored page path, from orbit_va_page_label().
 *
 * The paths are Next routes rather than PHP file names — `/courses` instead of
 * `courses.php` — so the map is rewritten, but the behaviour is the same: a
 * known page gets its own menu label, a course page gets the course's title, and
 * anything else is shown as the path it is.
 */

const KNOWN: Record<string, string> = {
  '/': 'nav.home',
  '/courses': 'nav.courses',
  '/online-classes': 'nav.online_classes',
  '/notices': 'nav.notices',
  '/gallery': 'nav.gallery',
  '/results': 'nav.results',
  '/apply': 'va.page.apply',
  '/check-status': 'nav.check_status',
  '/inquiry': 'inquiry.page_title',
  '/trial-classes': 'va.page.trial_classes',
  '/forgot-password': 'va.page.forgot_password',
  '/reset-password': 'va.page.reset_password',
  '/student/login': 'nav.student_login',
  '/guardian/login': 'nav.guardian_login',
};

/** Portal paths whose menu key differs from the last URL segment. */
const NAV_ALIAS: Record<string, string> = {
  'live-classes': 'live',
  materials: 'materials',
  recordings: 'recordings',
};

export function pageLabel(
  path: string,
  lang: Lang,
  courseTitles: Map<string, string> = new Map()
): string {
  const course = /^\/courses\/?\?id=(\d+)$/.exec(path);
  if (course) {
    const title = (courseTitles.get(path) ?? '').trim();
    return title !== ''
      ? translate(lang, 'va.page_course', { title })
      : translate(lang, 'va.page_course_id', { id: toLocalDigits(Number(course[1]), lang) });
  }

  const known = KNOWN[path];
  if (known !== undefined && hasTranslation(known)) return translate(lang, known);

  // A course page with no id at all.
  if (/^\/courses\/[^/?]+$/.test(path)) return translate(lang, 'va.page.course');

  // Portal pages read as "Student portal › Attendance".
  const portal = /^\/(student|guardian)\/([a-z0-9-]+)$/.exec(path);
  if (portal) {
    const segment = portal[2];
    const key = `${portal[1]}.nav.${NAV_ALIAS[segment] ?? segment}`;
    const page = hasTranslation(key) ? translate(lang, key) : segment;
    return `${translate(lang, `va.portal.${portal[1]}`)} › ${page}`;
  }

  return path;
}
