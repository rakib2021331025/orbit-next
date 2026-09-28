'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { BRANCH_COOKIE } from './active';

/**
 * Switches the branch an all-branch admin is viewing.
 *
 * A branch-locked admin cannot: their branch is the lock, and accepting a value
 * from them here would undo it. The request is simply ignored rather than
 * refused, since the UI never offers them the control.
 */
export async function setActiveBranch(branchId: number, path?: string): Promise<void> {
  const admin = await requireAdmin();
  if (admin.role === 'branch_admin') return;

  const id = Number.isInteger(branchId) && branchId > 0 ? branchId : 0;
  const store = await cookies();

  if (id === 0) {
    store.delete(BRANCH_COOKIE);
  } else {
    store.set(BRANCH_COOKIE, String(id), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  // Every list on the page was filtered by the old branch.
  revalidatePath(path && path.startsWith('/admin') ? path : '/admin');
}
