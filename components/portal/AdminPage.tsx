import { requireAdmin, requireSuperAdmin, requireDeveloper, type AdminAccount } from '@/lib/auth/guards';
import { getTranslator, type Translator } from '@/lib/i18n';
import { adminNav, adminBadgeCounts, BRANCH_ADMIN_ALLOWED } from '@/lib/nav/admin';
import { mayManageAdmins } from '@/lib/auth/developer';
import { AdminShell } from './AdminShell';
import { AdminBranchBar } from './AdminBranchBar';
import { ForbiddenNotice } from './ForbiddenNotice';

/**
 * Guard, menu and chrome for an admin page.
 *
 * `level` is the gate, and it is the whole reason this wrapper exists:
 *
 *   'admin'      any active admin, subject to the branch allow-list
 *   'super'      institute-wide pages — fees, reports, exams, inquiries
 *   'developer'  Admin → Admins and Branches
 *
 * A branch-locked admin opening a page outside the allow-list is refused here
 * rather than shown a filtered version of it, which is what
 * orbit_branch_admin_gate() does. `route` is the path the allow-list is checked
 * against, so a page added later is closed until it is listed deliberately.
 */
export interface AdminPageContext {
  admin: AdminAccount;
  t: Translator;
  /** 0 for an all-branch admin; otherwise the branch they are pinned to. */
  branchLock: number;
}

export async function AdminPage({
  active,
  route,
  level = 'admin',
  title,
  subtitle,
  actions,
  children,
}: {
  active: string;
  /** This page's own route, e.g. `/admin/students`. */
  route: string;
  level?: 'admin' | 'super' | 'developer';
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode | ((ctx: AdminPageContext) => React.ReactNode);
}) {
  const admin =
    level === 'developer'
      ? await requireDeveloper()
      : level === 'super'
        ? await requireSuperAdmin()
        : await requireAdmin();

  const translator = await getTranslator();
  const [badges, canManageAdmins] = await Promise.all([
    adminBadgeCounts(),
    mayManageAdmins(admin.email),
  ]);

  const branchLock = admin.role === 'branch_admin' && admin.branch_id ? admin.branch_id : 0;
  const blocked = branchLock > 0 && !BRANCH_ADMIN_ALLOWED.includes(route);

  return (
    <AdminShell
      active={active}
      groups={adminNav(admin, badges, canManageAdmins)}
      badges={badges}
      admin={admin}
      t={translator.t}
      lang={translator.lang}
      title={blocked ? translator.t('branch.page_locked_title') : title}
      subtitle={blocked ? undefined : subtitle}
      actions={blocked ? undefined : actions}
      branchBar={<AdminBranchBar admin={admin} t={translator} />}
    >
      {blocked ? (
        <ForbiddenNotice
          title={translator.t('branch.page_locked_title')}
          body={translator.t('branch.page_locked_body')}
        />
      ) : typeof children === 'function' ? (
        children({ admin, t: translator, branchLock })
      ) : (
        children
      )}
    </AdminShell>
  );
}
