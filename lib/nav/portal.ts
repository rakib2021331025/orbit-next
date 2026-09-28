import 'server-only';
import { pruneGroups, type NavGroup } from './types';

/**
 * The three sidebar menus — student, teacher, guardian — ported from
 * includes/{student,teacher,guardian}_header.php.
 *
 * All three share one rule that is easy to lose in a rewrite: while
 * `must_change_password` is set, the menu collapses to Settings alone. The guard
 * already redirects every other page there, so a full menu would only offer
 * links that bounce straight back.
 */

export interface StudentNavOptions {
  /** must_change_password — collapses the menu to Settings. */
  locked: boolean;
  /** Unread notices, shown as a pill. */
  unread: number;
  /** Academic AI appears only when an admin switched it on AND a key is set. */
  aiAvailable: boolean;
}

export function studentNav({ locked, unread, aiAvailable }: StudentNavOptions): NavGroup[] {
  const learning = [
    { key: 'routine', href: '/student/routine', labelKey: 'student.nav.routine', icon: 'bi-calendar-week-fill' },
    { key: 'live', href: '/student/live-classes', labelKey: 'student.nav.live', icon: 'bi-camera-video-fill' },
    { key: 'recordings', href: '/student/recordings', labelKey: 'student.nav.recordings', icon: 'bi-collection-play-fill' },
    { key: 'attendance', href: '/student/attendance', labelKey: 'student.nav.attendance', icon: 'bi-calendar-check-fill' },
    { key: 'results', href: '/student/results', labelKey: 'student.nav.results', icon: 'bi-award-fill' },
    { key: 'progress', href: '/student/progress', labelKey: 'student.nav.progress', icon: 'bi-graph-up-arrow' },
    { key: 'exams', href: '/student/exams', labelKey: 'student.nav.exams', icon: 'bi-journal-check' },
    { key: 'materials', href: '/student/materials', labelKey: 'student.nav.materials', icon: 'bi-folder2-open' },
    { key: 'assignments', href: '/student/assignments', labelKey: 'student.nav.assignments', icon: 'bi-file-earmark-text-fill' },
  ];

  // Academic AI joins the learning group only once it can actually answer, so a
  // student is never sent to a page that will apologise.
  if (aiAvailable) {
    learning.push({
      key: 'academic_ai',
      href: '/student/academic-ai',
      labelKey: 'student.nav.academic_ai',
      icon: 'bi-stars',
    });
  }

  const groups: NavGroup[] = [
    {
      key: 'main',
      labelKey: 'student.nav.main',
      items: [
        { key: 'dashboard', href: '/student', labelKey: 'student.nav.dashboard', icon: 'bi-grid-1x2-fill' },
        { key: 'courses', href: '/student/courses', labelKey: 'student.nav.courses', icon: 'bi-journal-bookmark-fill' },
        { key: 'notices', href: '/student/notices', labelKey: 'student.nav.notices', icon: 'bi-megaphone-fill', badge: unread },
      ],
    },
    { key: 'learning', labelKey: 'student.nav.learning', items: learning },
    {
      key: 'account',
      labelKey: 'student.nav.account',
      items: [
        { key: 'payments', href: '/student/payments', labelKey: 'student.nav.payments', icon: 'bi-wallet2' },
        { key: 'profile', href: '/student/profile', labelKey: 'student.nav.profile', icon: 'bi-person-badge-fill' },
        { key: 'settings', href: '/student/settings', labelKey: 'student.nav.settings', icon: 'bi-gear-fill' },
      ],
    },
  ];

  return pruneGroups(locked ? onlySettings(groups) : groups);
}

export function teacherNav(unread: number, pendingEvaluations: number): NavGroup[] {
  return [
    {
      key: 'main',
      labelKey: 'tch.nav.main',
      items: [
        { key: 'dashboard', href: '/teacher', labelKey: 'tch.nav.dashboard', icon: 'bi-grid-1x2-fill' },
        { key: 'notifications', href: '/teacher/notifications', labelKey: 'tch.nav.notifications', icon: 'bi-bell-fill', badge: unread },
      ],
    },
    {
      key: 'teaching',
      labelKey: 'tch.nav.teaching',
      items: [
        { key: 'classes', href: '/teacher/live-classes', labelKey: 'tch.nav.live', icon: 'bi-camera-video-fill' },
        { key: 'exams', href: '/teacher/exams', labelKey: 'tch.nav.exams', icon: 'bi-journal-check' },
        { key: 'evaluation', href: '/teacher/evaluations', labelKey: 'tch.nav.evaluation', icon: 'bi-clipboard-check-fill', badge: pendingEvaluations },
      ],
    },
  ];
}

/**
 * The guardian menu.
 *
 * Every child page carries `?student=<id>` so switching child keeps the section
 * you were looking at. The id is still resolved against the guardian's own
 * children on the server — the query string is a convenience, never permission.
 */
export function guardianNav(locked: boolean, childId: number | null): NavGroup[] {
  const child = childId ? `?student=${childId}` : '';

  const groups: NavGroup[] = [
    {
      key: 'main',
      labelKey: 'guardian.nav.main',
      items: [
        { key: 'dashboard', href: '/guardian', labelKey: 'guardian.nav.dashboard', icon: 'bi-grid-1x2-fill' },
        { key: 'attendance', href: `/guardian/attendance${child}`, labelKey: 'guardian.nav.attendance', icon: 'bi-calendar-check-fill' },
        { key: 'results', href: `/guardian/results${child}`, labelKey: 'guardian.nav.results', icon: 'bi-award-fill' },
        { key: 'progress', href: `/guardian/progress${child}`, labelKey: 'guardian.nav.progress', icon: 'bi-graph-up-arrow' },
        { key: 'payments', href: `/guardian/payments${child}`, labelKey: 'guardian.nav.payments', icon: 'bi-wallet2' },
        { key: 'notices', href: `/guardian/notices${child}`, labelKey: 'guardian.nav.notices', icon: 'bi-megaphone-fill' },
      ],
    },
    {
      key: 'account',
      labelKey: 'guardian.nav.account',
      items: [
        { key: 'settings', href: '/guardian/settings', labelKey: 'guardian.nav.settings', icon: 'bi-gear-fill' },
      ],
    },
  ];

  return pruneGroups(locked ? onlySettings(groups) : groups);
}

/** Keeps only the Settings entry, as the locked-account branch of each header does. */
function onlySettings(groups: NavGroup[]): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.key === 'settings'),
  }));
}
