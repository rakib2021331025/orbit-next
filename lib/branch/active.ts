import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/guards';

/**
 * Which branch an all-branch admin is currently looking at.
 *
 * The PHP app keeps this in the session and lets `?branch=<id>` change it, which
 * is why **`?branch=` is a reserved query parameter** across the whole admin area:
 * a page that used it for its own filter would silently move the admin to another
 * branch. `admin/recorded_classes.php` learned that the hard way and renamed its
 * filter to `fbranch`.
 *
 * Here the value lives in its own cookie. Middleware translates a `?branch=`
 * link into that cookie, so existing bookmarks keep working, and the reserved
 * status of the parameter is unchanged.
 *
 * 0 means "all branches". For a branch-locked admin the answer is always their
 * own branch, whatever the cookie says — that is the lock.
 */

export const BRANCH_COOKIE = 'orbit_admin_branch';

export async function activeBranchId(): Promise<number> {
  const admin = await requireAdmin();
  if (admin.role === 'branch_admin' && admin.branch_id) return admin.branch_id;

  const raw = (await cookies()).get(BRANCH_COOKIE)?.value ?? '';
  const id = /^\d+$/.test(raw) ? Number(raw) : 0;
  if (id <= 0) return 0;

  // The remembered branch may have been deleted since.
  try {
    const exists = await prisma.branch.findUnique({ where: { id }, select: { id: true } });
    return exists ? id : 0;
  } catch {
    return 0;
  }
}

/** True when the install has more than one branch and the bar is worth showing. */
export async function branchesEnabled(): Promise<boolean> {
  try {
    return (await prisma.branch.count()) > 1;
  } catch {
    return false;
  }
}
