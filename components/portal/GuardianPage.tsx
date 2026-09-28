import { notFound, redirect } from 'next/navigation';
import {
  requireGuardian,
  requireGuardianChild,
  NotFoundError,
  type GuardianAccount,
  type GuardianChild,
} from '@/lib/auth/guards';
import { getTranslator, type Translator } from '@/lib/i18n';
import { guardianNav } from '@/lib/nav/portal';
import { PortalShell } from './PortalShell';
import { trackPageView } from '@/lib/analytics/track';
import { ChildSwitcher } from './ChildSwitcher';
import { EmptyState } from '@/components/ui/Feedback';

/**
 * Guard, child resolution, menu and chrome for a guardian page.
 *
 * `?student=<id>` is resolved against this guardian's own active children and
 * nothing else. An id belonging to another family is a **404**, not a 403 — a 403
 * would confirm that the student exists, which is itself a leak. That is
 * guardian_auth.php's rule and it is the one a URL-editing parent tests first.
 *
 * `needsChild` marks the pages that are about a child. With no linked child they
 * show an empty state instead of half-rendering, as the original does.
 */
export interface GuardianPageContext {
  guardian: GuardianAccount;
  child: GuardianChild | null;
  children: GuardianChild[];
  t: Translator;
}

export async function GuardianPage({
  active,
  title,
  subtitle,
  actions,
  needsChild = false,
  allowLocked = false,
  searchParams,
  switchTo,
  children,
}: {
  active: string;
  /** A function when the heading names the selected child. */
  title: string | ((t: Translator, child: GuardianChild | null) => string);
  subtitle?: string | ((t: Translator, child: GuardianChild | null) => string);
  actions?: React.ReactNode;
  needsChild?: boolean;
  allowLocked?: boolean;
  /** The page's own `?student=` value. */
  searchParams?: { student?: string };
  /** Where the child switcher links; defaults to the current section. */
  switchTo?: string;
  children: React.ReactNode | ((ctx: GuardianPageContext) => React.ReactNode);
}) {
  const guardian = await requireGuardian();
  if (guardian.mustChangePassword && !allowLocked) redirect('/guardian/settings?first=1');

  // The guardian portal counts as website traffic, like the public site.
  await trackPageView();

  const translator = await getTranslator();

  let resolved: { children: GuardianChild[]; child: GuardianChild | null };
  try {
    resolved = await requireGuardianChild(guardian.id, searchParams?.student);
  } catch (error) {
    // Never trust ?student: an unlinked, inactive or unknown student is
    // "not found", exactly as guardian_auth.php answers.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const banner =
    resolved.children.length > 1 && !guardian.mustChangePassword ? (
      <ChildSwitcher
        childrenList={resolved.children.map((child) => ({
          id: child.id,
          name: translator.pick(child, 'name'),
          course: child.course,
        }))}
        activeId={resolved.child?.id ?? null}
        switchTo={switchTo ?? `/guardian/${active === 'dashboard' ? '' : active}`}
        label={translator.t('guardian.switch_child')}
      />
    ) : undefined;

  const body =
    needsChild && !resolved.child ? (
      <EmptyState
        icon="bi-person-x"
        title={translator.t('guardian.switch_child')}
        body={translator.t('guardian.no_children')}
      />
    ) : typeof children === 'function' ? (
      children({ guardian, child: resolved.child, children: resolved.children, t: translator })
    ) : (
      children
    );

  return (
    <PortalShell
      active={active}
      groups={guardianNav(guardian.mustChangePassword, resolved.child?.id ?? null)}
      t={translator.t}
      lang={translator.lang}
      portalTitle={translator.t('guardian.portal')}
      homeHref="/guardian"
      user={{ name: guardian.displayName, meta: guardian.phone }}
      title={typeof title === 'function' ? title(translator, resolved.child) : title}
      subtitle={typeof subtitle === 'function' ? subtitle(translator, resolved.child) : subtitle}
      actions={actions}
      banner={banner}
    >
      {body}
    </PortalShell>
  );
}
