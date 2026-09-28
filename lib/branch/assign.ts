import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { adminBranchLock } from '@/lib/auth/guards';

/**
 * Which branch to store on something an admin just saved —
 * orbit_admin_record_branch() and orbit_admin_content_branch().
 *
 * The two differ in what "no branch" means, and the difference matters:
 *
 *   - **A record** (student, batch, application) must always belong to exactly
 *     one branch, so a missing or invalid choice falls back to the main branch.
 *     A student belonging to nowhere would be invisible to every branch admin.
 *   - **Content** (a notice, a class, a material) may be shared by every branch,
 *     so "none" is a real answer and stays null.
 *
 * Both begin the same way: a branch-locked admin writes to their own branch
 * whatever the form said. The posted value is never trusted — that is the lock.
 */

/** A submitted branch id, if it names a branch that exists. */
async function validBranchId(submitted: unknown): Promise<number> {
  const id = Number(String(submitted ?? '').trim());
  if (!Number.isInteger(id) || id <= 0) return 0;
  try {
    const row = await prisma.branch.findUnique({ where: { id }, select: { id: true } });
    return row ? row.id : 0;
  } catch {
    return 0;
  }
}

/** The institute's main branch, or the lowest-numbered one as a fallback. */
export async function mainBranchId(): Promise<number> {
  try {
    const main = await prisma.branch.findFirst({
      where: { is_main: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (main) return main.id;

    const first = await prisma.branch.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
    return first?.id ?? 0;
  } catch {
    return 0;
  }
}

/** For a student, batch or application: always exactly one branch. */
export async function recordBranchId(submitted: unknown): Promise<number> {
  const lock = await adminBranchLock();
  if (lock > 0) return lock;

  const id = await validBranchId(submitted);
  return id > 0 ? id : await mainBranchId();
}

/** For content: null means "every branch", and is a legitimate answer. */
export async function contentBranchId(submitted: unknown): Promise<number | null> {
  const lock = await adminBranchLock();
  if (lock > 0) return lock;

  const id = await validBranchId(submitted);
  return id > 0 ? id : null;
}
