import { requireTeacher, type TeacherAccount } from '@/lib/auth/guards';
import { getTranslator, type Translator } from '@/lib/i18n';
import { teacherNav } from '@/lib/nav/portal';
import { unreadCount, teacherPendingEvaluations } from '@/lib/notifications/counts';
import { uploadUrl } from '@/lib/storage/url';
import { PortalShell } from './PortalShell';

/**
 * Guard, menu and chrome for a teacher page.
 *
 * The teacher row is re-read here on every request, which is the point
 * teacher_header.php makes in its own comment: an account an admin deactivates
 * loses access on its very next request, whatever session or remember-me cookie
 * it still holds.
 */
export interface TeacherPageContext {
  teacher: TeacherAccount;
  t: Translator;
}

export async function TeacherPage({
  active,
  title,
  subtitle,
  actions,
  banner,
  children,
}: {
  active: string;
  title: string | ((t: Translator, teacher: TeacherAccount) => string);
  subtitle?: string | ((t: Translator, teacher: TeacherAccount) => string);
  actions?: React.ReactNode | ((t: Translator) => React.ReactNode);
  banner?: React.ReactNode;
  children: React.ReactNode | ((ctx: TeacherPageContext) => React.ReactNode);
}) {
  const teacher = await requireTeacher();
  const translator = await getTranslator();

  const [unread, pending] = await Promise.all([
    unreadCount('teacher', teacher.id),
    teacherPendingEvaluations(teacher.id),
  ]);

  return (
    <PortalShell
      active={active}
      groups={teacherNav(unread, pending)}
      t={translator.t}
      lang={translator.lang}
      portalTitle={translator.t('tch.portal')}
      homeHref="/teacher"
      user={{
        name: translator.pick(teacher, 'name'),
        meta: teacher.email,
        photo: teacher.photo ? uploadUrl(teacher.photo) : null,
      }}
      title={typeof title === 'function' ? title(translator, teacher) : title}
      subtitle={typeof subtitle === 'function' ? subtitle(translator, teacher) : subtitle}
      actions={typeof actions === 'function' ? actions(translator) : actions}
      banner={banner}
    >
      {typeof children === 'function' ? children({ teacher, t: translator }) : children}
    </PortalShell>
  );
}
