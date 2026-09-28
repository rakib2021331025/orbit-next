import { prisma } from '@/lib/db/prisma';
import { Badge } from '@/components/ui/Feedback';
import { BranchBar } from './AdminShell';
import { BranchPicker } from './BranchPicker';
import { activeBranchId } from '@/lib/branch/active';
import type { AdminAccount } from '@/lib/auth/guards';
import type { Translator } from '@/lib/i18n';

/**
 * The strip under the admin navbar saying which branch is in view.
 *
 * A branch-locked admin gets a statement of fact — they cannot change it, and a
 * switcher that refuses is worse than no switcher. An all-branch admin gets the
 * picker, whose choice is remembered.
 *
 * Nothing shows on a single-branch install: a control with one option is noise.
 */
export async function AdminBranchBar({
  admin,
  t,
}: {
  admin: AdminAccount;
  t: Translator;
}) {
  let branches: { id: number; name_bn: string; name_en: string; is_main: boolean }[] = [];
  try {
    branches = await prisma.branch.findMany({
      where: { status: 'active' },
      orderBy: [{ sort_order: 'asc' }, { name_en: 'asc' }],
      select: { id: true, name_bn: true, name_en: true, is_main: true },
    });
  } catch {
    // Branches arrive with schema 2036; before that there is nothing to show.
    return null;
  }

  if (branches.length < 2 && admin.role !== 'branch_admin') return null;

  // `name_bn` / `name_en`, not the `name` + `name_bn` pair students use — reading
  // it the other way returns an empty label with no error.
  const named = branches.map((branch) => ({
    id: branch.id,
    name: t.pickPair(branch, 'name'),
  }));

  if (admin.role === 'branch_admin') {
    const own = named.find((branch) => branch.id === admin.branch_id);
    return (
      <BranchBar>
        <i className="bi bi-diagram-3 text-ink-muted" aria-hidden />
        <span className="text-ink-muted">{t.t('branch.locked_hint')}</span>
        <Badge tone="info">{own?.name ?? `#${admin.branch_id}`}</Badge>
      </BranchBar>
    );
  }

  return (
    <BranchBar>
      <i className="bi bi-diagram-3 text-ink-muted" aria-hidden />
      <BranchPicker
        branches={named}
        activeId={await activeBranchId()}
        allLabel={t.t('branch.all_branches')}
        label={t.t('branch.choose')}
      />
    </BranchBar>
  );
}
