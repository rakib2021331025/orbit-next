import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { pruneGroups, type NavGroup } from './types';
import type { AdminAccount } from '@/lib/auth/guards';

/**
 * The admin menu, ported group for group from includes/admin_nav.php.
 *
 * Three filters run over it, in the original's order, and each one exists for a
 * reason worth keeping:
 *
 *   1. The developer-only entry disappears when the signed-in admin is not the
 *      developer — a menu item that always leads to a refusal is worse than no
 *      menu item.
 *   2. A branch-locked admin sees only the pages the allow-list lets them open.
 *      The list is the same one the guard uses, so the menu cannot drift out of
 *      step with what is actually permitted.
 *   3. Groups left empty by either filter are dropped.
 *
 * The menu is therefore never the security boundary; it just stops showing doors
 * that are locked.
 */

/**
 * Admin routes a branch-locked admin may open, from
 * orbit_branch_admin_allowed_scripts(). Paths are the orbit-next routes that
 * correspond to those 19 PHP scripts.
 *
 * A page added later is closed to branch admins until it is added here
 * deliberately — the same safe-by-default behaviour as the original.
 */
export const BRANCH_ADMIN_ALLOWED: readonly string[] = [
  '/admin',
  '/admin/login',
  '/admin/logout',
  '/admin/students',
  '/admin/students/[id]',
  '/admin/payment',
  '/admin/applications',
  '/admin/payment-screenshot',
  '/admin/batches',
  '/admin/attendance',
  '/admin/attendance-report',
  '/admin/payment-tracking',
  '/admin/notices',
  '/admin/routine',
  '/admin/assignments',
  '/admin/materials',
  '/admin/recorded-classes',
];

export interface AdminBadges {
  apps: number;
  evaluations: number;
  inquiries: number;
}

/**
 * The three pending counts shown as pills, in one query as
 * orbit_admin_badge_counts() does.
 *
 * A failure returns zeros: a badge is decoration, and no admin page should fail
 * to render because a count could not be read.
 *
 * Memoised per request: the admin shell asks on every page, and the dashboard
 * needs two of the same institute-wide counts (evaluations, inquiries) — it
 * reuses these instead of counting again.
 */
export const adminBadgeCounts = cache(async (): Promise<AdminBadges> => {
  try {
    const [apps, evaluations, inquiries] = await Promise.all([
      prisma.admission.count({
        where: { status: { in: ['pending', 'under_review', 'payment_verified'] } },
      }),
      prisma.examAttempt.count({ where: { status: 'submitted' } }),
      prisma.inquiry.count({ where: { status: 'new' } }),
    ]);
    return { apps, evaluations, inquiries };
  } catch {
    return { apps: 0, evaluations: 0, inquiries: 0 };
  }
});

export function adminNav(
  admin: AdminAccount,
  badges: AdminBadges,
  canManageAdmins: boolean
): NavGroup[] {
  const groups: NavGroup[] = [
    {
      key: 'academics',
      labelKey: 'admin.nav.academics',
      icon: 'bi-mortarboard',
      items: [
        { key: 'courses', href: '/admin/courses', labelKey: 'admin.nav.courses', icon: 'bi-journal-bookmark' },
        { key: 'batches', href: '/admin/batches', labelKey: 'admin.nav.batches', icon: 'bi-collection' },
        { key: 'monthly_exams', href: '/admin/monthly-exams', labelKey: 'admin.nav.monthly_exams', icon: 'bi-clipboard-data' },
        { key: 'subjects', href: '/admin/subjects', labelKey: 'admin.nav.subjects', icon: 'bi-list-ol' },
        { key: 'exams', href: '/admin/exams', labelKey: 'admin.nav.online_exams', icon: 'bi-journal-check' },
        { key: 'evaluation', href: '/admin/exam-evaluation', labelKey: 'admin.nav.evaluation', icon: 'bi-clipboard-check', badge: badges.evaluations },
        { key: 'live', href: '/admin/live-classes', labelKey: 'admin.nav.live_classes', icon: 'bi-camera-video' },
        { key: 'recordings', href: '/admin/recorded-classes', labelKey: 'admin.nav.recordings', icon: 'bi-collection-play' },
        { key: 'routine', href: '/admin/routine', labelKey: 'admin.nav.routine', icon: 'bi-calendar-week' },
        { key: 'materials', href: '/admin/materials', labelKey: 'admin.nav.materials', icon: 'bi-folder2-open' },
        { key: 'assignments', href: '/admin/assignments', labelKey: 'admin.nav.assignments', icon: 'bi-file-earmark-text' },
        { key: 'notes', href: '/admin/notes', labelKey: 'admin.nav.notes', icon: 'bi-envelope-paper' },
        { key: 'printables', href: '/admin/printables', labelKey: 'admin.nav.printables', icon: 'bi-printer' },
      ],
    },
    {
      key: 'students',
      labelKey: 'admin.nav.students',
      icon: 'bi-people',
      items: [
        { key: 'students', href: '/admin/students', labelKey: 'admin.nav.student_list', icon: 'bi-person-lines-fill' },
        { key: 'applications', href: '/admin/applications', labelKey: 'admin.nav.enrollments', icon: 'bi-person-check', badge: badges.apps },
        { key: 'inquiries', href: '/admin/inquiries', labelKey: 'admin.nav.inquiries', icon: 'bi-telephone-inbound', badge: badges.inquiries },
        { key: 'attendance', href: '/admin/attendance', labelKey: 'admin.nav.attendance', icon: 'bi-calendar-check' },
        { key: 'attendance_report', href: '/admin/attendance-report', labelKey: 'admin.nav.attendance_report', icon: 'bi-file-earmark-spreadsheet' },
        { key: 'logins', href: '/admin/student-logins', labelKey: 'admin.nav.logins', icon: 'bi-key' },
        { key: 'guardians', href: '/admin/guardians', labelKey: 'admin.nav.guardians', icon: 'bi-people-fill' },
        { key: 'teachers', href: '/admin/teachers', labelKey: 'admin.nav.teachers', icon: 'bi-person-badge' },
      ],
    },
    {
      key: 'finance',
      labelKey: 'admin.nav.finance',
      icon: 'bi-cash-coin',
      items: [
        { key: 'applications_pay', href: '/admin/applications?state=pending', labelKey: 'admin.nav.enrollments', icon: 'bi-wallet2', badge: badges.apps },
        { key: 'payments', href: '/admin/payment-tracking', labelKey: 'admin.nav.payment_tracking', icon: 'bi-receipt' },
        { key: 'fees', href: '/admin/fees', labelKey: 'admin.nav.fees', icon: 'bi-cash-stack' },
        { key: 'reports', href: '/admin/reports', labelKey: 'admin.nav.reports', icon: 'bi-bar-chart' },
        { key: 'coaching_analytics', href: '/admin/coaching-analytics', labelKey: 'admin.nav.coaching_analytics', icon: 'bi-graph-up' },
      ],
    },
    {
      key: 'website',
      labelKey: 'admin.nav.website',
      icon: 'bi-globe2',
      items: [
        { key: 'analytics', href: '/admin/visitor-analytics', labelKey: 'admin.nav.analytics', icon: 'bi-graph-up-arrow' },
        { key: 'promotions', href: '/admin/promotions', labelKey: 'admin.nav.promotions', icon: 'bi-megaphone' },
        { key: 'gifts', href: '/admin/gifts', labelKey: 'admin.nav.gifts', icon: 'bi-gift' },
        { key: 'notices', href: '/admin/notices', labelKey: 'admin.nav.notices', icon: 'bi-bell' },
        { key: 'gallery', href: '/admin/gallery', labelKey: 'admin.nav.gallery', icon: 'bi-images' },
        { key: 'gallery_categories', href: '/admin/gallery-categories', labelKey: 'admin.nav.gallery_categories', icon: 'bi-tags' },
        { key: 'achievements', href: '/admin/achievements', labelKey: 'admin.nav.achievements', icon: 'bi-trophy' },
        { key: 'trial_classes', href: '/admin/trial-classes', labelKey: 'admin.nav.trial_classes', icon: 'bi-play-btn' },
      ],
    },
    {
      key: 'system',
      labelKey: 'admin.nav.system',
      icon: 'bi-gear',
      items: [
        { key: 'branches', href: '/admin/branches', labelKey: 'admin.nav.branches', icon: 'bi-diagram-3' },
        { key: 'admins', href: '/admin/admins', labelKey: 'admin.nav.admins', icon: 'bi-person-gear' },
        { key: 'settings', href: '/admin/settings', labelKey: 'admin.nav.settings', icon: 'bi-sliders' },
        { key: 'backup', href: '/admin/backup', labelKey: 'admin.nav.backup', icon: 'bi-database-down' },
        { key: 'email_log', href: '/admin/email-log', labelKey: 'admin.nav.email_log', icon: 'bi-envelope-check' },
        // The two diagnostics: what this server can do, and whether the
        // assistant really reaches Google from it.
        { key: 'system_check', href: '/admin/tools/system-check', labelKey: 'admin.nav.system', icon: 'bi-activity' },
        { key: 'ai_check', href: '/admin/tools/ai-check', labelKey: 'set.tab.ai', icon: 'bi-robot' },
      ],
    },
  ];

  let filtered = groups;

  // 1. The developer's own pages.
  if (!canManageAdmins) {
    filtered = filtered.map((group) =>
      group.key === 'system'
        ? { ...group, items: group.items.filter((item) => item.key !== 'admins') }
        : group
    );
  }

  // 2. A branch-locked admin: only the allow-listed pages.
  if (admin.role === 'branch_admin') {
    filtered = filtered.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        BRANCH_ADMIN_ALLOWED.includes(item.href.split('?')[0])
      ),
    }));
  }

  // 3. Drop what the filters emptied.
  return pruneGroups(filtered);
}

/** The group badge shown on the collapsed navbar, as the original computes it. */
export function adminGroupBadge(groupKey: string, badges: AdminBadges): number {
  if (groupKey === 'students') return badges.apps + badges.inquiries;
  if (groupKey === 'academics') return badges.evaluations;
  return 0;
}
