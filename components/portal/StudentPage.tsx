import { requireStudent } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/lib/i18n';
import { studentNav } from '@/lib/nav/portal';
import { unreadCount, aiAvailable } from '@/lib/notifications/counts';
import { studentPhotoUrl } from '@/lib/storage/url';
import { trackPageView } from '@/lib/analytics/track';
import { PortalShell } from './PortalShell';
import type { StudentAccount } from '@/lib/auth/guards';
import type { Translator } from '@/lib/i18n';

/**
 * One call at the top of every student page: guard, menu, chrome.
 *
 * Bundling them is not just tidiness. The guard is what stops a URL-editing user,
 * and a page that forgets to call it is a hole; making the chrome impossible to
 * render without it means forgetting is impossible too.
 *
 * `allowLocked` is for the two pages a student with a temporary password may
 * still reach — settings and logout. Everywhere else the redirect applies, which
 * is student_auth.php's rule.
 */
export interface StudentPageProps {
  active: string;
  title: string | ((t: Translator, student: StudentAccount) => string);
  subtitle?: string | ((t: Translator, student: StudentAccount) => string);
  actions?: React.ReactNode;
  banner?: React.ReactNode;
  allowLocked?: boolean;
  children: React.ReactNode | ((ctx: StudentPageContext) => React.ReactNode);
}

export interface StudentPageContext {
  student: StudentAccount;
  t: Translator;
}

export async function StudentPage({
  active,
  title,
  subtitle,
  actions,
  banner,
  allowLocked = false,
  children,
}: StudentPageProps) {
  const student = await requireStudent();
  if (student.mustChangePassword && !allowLocked) redirect('/student/settings?first=1');

  // The student portal counts as website traffic, like the public site.
  await trackPageView();

  const translator = await getTranslator();
  const [unread, ai] = await Promise.all([
    student.mustChangePassword ? Promise.resolve(0) : unreadCount('student', student.id),
    student.mustChangePassword ? Promise.resolve(false) : aiAvailable(),
  ]);

  const groups = studentNav({
    locked: student.mustChangePassword,
    unread,
    aiAvailable: ai,
  });

  return (
    <PortalShell
      active={active}
      groups={groups}
      t={translator.t}
      lang={translator.lang}
      portalTitle={translator.t('student.portal')}
      homeHref="/student"
      user={{
        name: translator.pick(student, 'name'),
        meta: student.username,
        photo: studentPhotoUrl(student) || null,
      }}
      title={typeof title === 'function' ? title(translator, student) : title}
      subtitle={typeof subtitle === 'function' ? subtitle(translator, student) : subtitle}
      actions={actions}
      banner={banner}
    >
      {typeof children === 'function' ? children({ student, t: translator }) : children}
    </PortalShell>
  );
}
