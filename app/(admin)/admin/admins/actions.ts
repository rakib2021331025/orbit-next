'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireDeveloper } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { forgetUser } from '@/lib/auth/remember';
import { getLang, translate } from '@/lib/i18n';

/**
 * Admin account actions, from admin/admins.php.
 *
 * Four rules are enforced **here**, not only in the form, because they are what
 * stops an institute locking itself out of its own admin area:
 *
 *   1. Only the developer account may manage admins at all, when
 *      `ORBIT_DEVELOPER_EMAIL` names one.
 *   2. A branch admin must name an existing branch; a super admin never keeps
 *      one.
 *   3. Nobody may lock, demote or re-branch **their own** account.
 *   4. The **last active super admin** can be neither locked nor demoted.
 *
 * A password is stored as a hash. A generated one is returned once, to be shown
 * on screen, and is never written anywhere else.
 */

export interface AdminState {
  errors: string[];
  message: string;
  /** A generated password, shown once right after it is created. */
  password: string;
  passwordFor: string;
}

const EMPTY_PASSWORD = { password: '', passwordFor: '' };

function refresh(): void {
  revalidatePath('/admin/admins');
  revalidatePath('/admin/branches');
}

/** A readable password: no l/I/O/0 to mistype when it is read out loud. */
function makePassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let index = 0; index < 12; index++) {
    out += alphabet[randomInt(0, alphabet.length)];
  }
  return out;
}

/** How many active super admins there are other than this one. */
async function otherActiveSupers(exceptId: number): Promise<number> {
  return prisma.admin
    .count({ where: { role: 'super_admin', status: 'active', NOT: { id: exceptId } } })
    .catch(() => 0);
}

export async function saveAdminAction(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const me = await requireDeveloper();
  const lang = await getLang();
  const errors: string[] = [];

  const id = Number(formData.get('id') ?? 0);
  const existing = id > 0 ? await prisma.admin.findUnique({ where: { id } }).catch(() => null) : null;
  if (id > 0 && !existing) {
    return { errors: [translate(lang, 'error.not_found_body')], message: '', ...EMPTY_PASSWORD };
  }

  const text = (key: string, max: number) =>
    String(formData.get(key) ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);

  const name = text('name', 191);
  const email = text('email', 255).toLowerCase();
  const role = formData.get('role') === 'branch_admin' ? 'branch_admin' : 'super_admin';
  const status = formData.get('status') === 'locked' ? 'locked' : 'active';
  // A super admin is never tied to a branch; a branch admin always is.
  const branchId = role === 'branch_admin' ? Number(formData.get('branch_id') ?? 0) || 0 : 0;

  const isSelf = existing !== null && existing.id === me.id;
  const generate = formData.get('generate_password') !== null;
  let password = String(formData.get('password') ?? '');

  if (name === '') errors.push(translate(lang, 'aadm.err_name'));

  if (email === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.push(translate(lang, 'aadm.err_email'));
  } else {
    const taken = await prisma.admin
      .findFirst({ where: { email, NOT: { id } }, select: { id: true } })
      .catch(() => null);
    if (taken) errors.push(translate(lang, 'aadm.err_email_taken'));
  }

  if (role === 'branch_admin') {
    const branch =
      branchId > 0
        ? await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } }).catch(() => null)
        : null;
    if (!branch) errors.push(translate(lang, 'aadm.err_branch'));
  }

  if (isSelf && (status === 'locked' || role !== 'super_admin')) {
    errors.push(translate(lang, 'aadm.err_self'));
  }

  if (
    existing &&
    existing.role === 'super_admin' &&
    existing.status === 'active' &&
    (role !== 'super_admin' || status !== 'active') &&
    (await otherActiveSupers(existing.id)) === 0
  ) {
    errors.push(translate(lang, 'aadm.err_last_super'));
  }

  if (generate) password = makePassword();
  if (!existing && password === '') errors.push(translate(lang, 'aadm.err_password_required'));
  if (password !== '' && password.length < 8) {
    errors.push(translate(lang, 'aadm.err_password_short'));
  }

  if (errors.length > 0) return { errors, message: '', ...EMPTY_PASSWORD };

  try {
    if (existing) {
      await prisma.admin.update({
        where: { id },
        data: {
          name,
          email,
          role,
          status,
          branch_id: branchId > 0 ? branchId : null,
          ...(password !== '' ? { password_hash: await hashPassword(password) } : {}),
        },
      });

      // Locked, or the password changed: every remembered login for that account
      // has to go, or the old browser stays signed in.
      if (status === 'locked' || password !== '') await forgetUser('admin', id);
    } else {
      await prisma.admin.create({
        data: {
          name,
          email,
          password_hash: await hashPassword(password),
          role,
          status,
          branch_id: branchId > 0 ? branchId : null,
          created_by: me.id > 0 ? me.id : null,
        },
      });
    }
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '', ...EMPTY_PASSWORD };
  }

  refresh();
  return {
    errors: [],
    message: translate(lang, existing ? 'aadm.saved' : 'aadm.created', { name }),
    // Shown once, here, and stored nowhere.
    password: generate ? password : '',
    passwordFor: generate ? email : '',
  };
}

export async function toggleAdminAction(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const me = await requireDeveloper();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const target = await prisma.admin.findUnique({ where: { id } }).catch(() => null);
  if (!target) {
    return { errors: [translate(lang, 'error.not_found_body')], message: '', ...EMPTY_PASSWORD };
  }

  const lock = target.status === 'active';

  if (lock && target.id === me.id) {
    return { errors: [translate(lang, 'aadm.err_self')], message: '', ...EMPTY_PASSWORD };
  }
  if (lock && target.role === 'super_admin' && (await otherActiveSupers(target.id)) === 0) {
    return { errors: [translate(lang, 'aadm.err_last_super')], message: '', ...EMPTY_PASSWORD };
  }

  try {
    await prisma.admin.update({
      where: { id: target.id },
      data: { status: lock ? 'locked' : 'active' },
    });
    // Locking ends any live session of that account at once.
    if (lock) await forgetUser('admin', target.id);
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '', ...EMPTY_PASSWORD };
  }

  refresh();
  return {
    errors: [],
    message: translate(lang, lock ? 'aadm.locked_msg' : 'aadm.unlocked_msg', {
      // An admin row may carry no name; the email is what identifies it then.
      name: (target.name ?? '') !== '' ? target.name! : target.email,
    }),
    ...EMPTY_PASSWORD,
  };
}
