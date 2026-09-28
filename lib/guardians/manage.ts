import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { normaliseBdPhone } from '@/lib/auth/phone';
import { generateTempPassword } from '@/lib/enrollment/approve';

/**
 * Guardian accounts, from admin/guardians.php and includes/guardian_lib.php.
 *
 * A guardian signs in with **a phone number**, and the same number may belong to
 * several students — siblings share a parent. That is the shape of this whole
 * screen: accounts are created from a phone number and every student carrying it
 * is linked at once.
 *
 * Deactivating, resetting a password and deleting all drop the remembered
 * devices, for the same reason as teachers: an account that cannot sign in must
 * not have a device that still can.
 */

export const RELATIONS = ['father', 'mother', 'guardian'] as const;
export type Relation = (typeof RELATIONS)[number];

export interface GuardianOutcome {
  ok: boolean;
  /** A translation key. */
  message: string;
  vars?: Record<string, string | number>;
  guardianId?: number;
  /** A temporary password, shown once. */
  password?: string;
}

const fail = (message: string, vars?: Record<string, string | number>): GuardianOutcome => ({
  ok: false,
  message,
  vars,
});

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export async function guardianByPhone(phone: string) {
  const normalised = normaliseBdPhone(phone);
  if (normalised === null) return null;
  return safe(() => prisma.guardian.findFirst({ where: { phone: normalised } }), null);
}

export interface PhoneGroupStudent {
  id: number;
  student_id_no: string | null;
  roll_number: string | null;
  name: string;
  name_bn: string | null;
  guardian_phone: string | null;
  father_name: string | null;
  mother_name: string | null;
  course: string;
  batch: string | null;
  student_status: string;
  linked: boolean;
}

/**
 * Approved students grouped by their guardian's phone number.
 *
 * This is what makes "one account, all the siblings" possible: the group is the
 * unit of work, not the student.
 */
export async function phoneGroups(): Promise<Map<string, PhoneGroupStudent[]>> {
  const groups = new Map<string, PhoneGroupStudent[]>();

  const rows = await safe(
    () =>
      prisma.student.findMany({
        where: { status: 'approved', guardian_phone: { not: null } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          student_id_no: true,
          roll_number: true,
          name: true,
          name_bn: true,
          guardian_phone: true,
          father_name: true,
          mother_name: true,
          course: true,
          batch: true,
          student_status: true,
          guardianStudent_student: { select: { guardian_id: true } },
        },
      }),
    []
  );

  for (const row of rows) {
    const phone = normaliseBdPhone(row.guardian_phone);
    if (phone === null) continue;

    const student: PhoneGroupStudent = {
      id: row.id,
      student_id_no: row.student_id_no,
      roll_number: row.roll_number,
      name: row.name,
      name_bn: row.name_bn,
      guardian_phone: row.guardian_phone,
      father_name: row.father_name,
      mother_name: row.mother_name,
      course: row.course,
      batch: row.batch,
      student_status: row.student_status,
      linked: row.guardianStudent_student.length > 0,
    };
    groups.set(phone, [...(groups.get(phone) ?? []), student]);
  }

  return groups;
}

export async function studentsForPhone(phone: string): Promise<PhoneGroupStudent[]> {
  const normalised = normaliseBdPhone(phone);
  if (normalised === null) return [];
  return (await phoneGroups()).get(normalised) ?? [];
}

/**
 * A sensible name and relation for a new account: the father's name if any
 * student has one, else the mother's, else nothing and "guardian".
 */
export function defaultName(students: PhoneGroupStudent[]): { name: string | null; relation: Relation } {
  for (const [column, relation] of [
    ['father_name', 'father'],
    ['mother_name', 'mother'],
  ] as const) {
    for (const student of students) {
      const value = (student[column] ?? '').trim();
      if (value !== '') return { name: value.slice(0, 255), relation };
    }
  }
  return { name: null, relation: 'guardian' };
}

export interface UnlinkedGroup {
  phone: string;
  students: PhoneGroupStudent[];
  guardianId: number | null;
  name: string | null;
  relation: Relation;
}

/** Phone numbers with students who have no guardian account yet. */
export async function unlinkedGroups(search = ''): Promise<UnlinkedGroup[]> {
  const term = search.trim().toLowerCase();
  const digits = term.replace(/\D+/g, '');
  const out: UnlinkedGroup[] = [];
  const matched: { phone: string; students: PhoneGroupStudent[] }[] = [];

  for (const [phone, students] of await phoneGroups()) {
    const unlinked = students.filter((student) => !student.linked);
    if (unlinked.length === 0) continue;

    if (term !== '') {
      const hit =
        (digits !== '' && phone.includes(digits)) ||
        unlinked.some((student) =>
          [student.name, student.name_bn ?? '', student.student_id_no ?? ''].some((value) =>
            value.toLowerCase().includes(term)
          )
        );
      if (!hit) continue;
    }

    matched.push({ phone, students: unlinked });
  }

  // Every group's existing account in ONE query, not a guardianByPhone per
  // phone number — the list can run to hundreds of numbers. Same normalised
  // phone match as guardianByPhone; the lowest id wins if a number repeats.
  const lookup = new Map(matched.map((group) => [group.phone, normaliseBdPhone(group.phone)]));
  const phones = [...new Set([...lookup.values()].filter((phone): phone is string => phone !== null))];
  const accounts =
    phones.length > 0
      ? await safe(
          () =>
            prisma.guardian.findMany({
              where: { phone: { in: phones } },
              orderBy: { id: 'asc' },
              select: { id: true, phone: true },
            }),
          [] as { id: number; phone: string }[]
        )
      : [];
  const accountByPhone = new Map<string, number>();
  for (const account of accounts) {
    if (!accountByPhone.has(account.phone)) accountByPhone.set(account.phone, account.id);
  }

  for (const { phone, students } of matched) {
    const normalised = lookup.get(phone) ?? null;
    const { name, relation } = defaultName(students);
    out.push({
      phone,
      students,
      guardianId: normalised !== null ? (accountByPhone.get(normalised) ?? null) : null,
      name,
      relation,
    });
  }

  return out;
}

/** Creates an account with a temporary password the admin sees once. */
export async function createGuardian(
  phone: string,
  name: string | null,
  email: string | null,
  adminId: number
): Promise<{ id: number; password: string } | null> {
  const normalised = normaliseBdPhone(phone);
  if (normalised === null) return null;
  if (await guardianByPhone(normalised)) return null;

  const password = generateTempPassword(10);
  try {
    const created = await prisma.guardian.create({
      data: {
        phone: normalised,
        name: name && name.trim() !== '' ? name.trim().slice(0, 255) : null,
        email: email && email.trim() !== '' ? email.trim().slice(0, 255) : null,
        password: await hashPassword(password),
        // The admin knows this password, so the guardian must replace it.
        must_change_password: true,
        status: 'active',
        created_by: adminId > 0 ? adminId : null,
      },
      select: { id: true },
    });
    return { id: created.id, password };
  } catch {
    return null;
  }
}

/** Links a student. Returns true when a new link was actually made. */
export async function linkStudent(
  guardianId: number,
  studentId: number,
  relation: string | null
): Promise<boolean> {
  const value = (RELATIONS as readonly string[]).includes(relation ?? '')
    ? (relation as Relation)
    : null;

  try {
    const existing = await prisma.guardianStudent.findFirst({
      where: { guardian_id: guardianId, student_id: studentId },
      select: { id: true },
    });
    if (existing) return false;

    await prisma.guardianStudent.create({
      data: { guardian_id: guardianId, student_id: studentId, relation: value },
    });
    return true;
  } catch {
    return false;
  }
}

export async function unlinkStudent(guardianId: number, studentId: number): Promise<boolean> {
  try {
    const removed = await prisma.guardianStudent.deleteMany({
      where: { guardian_id: guardianId, student_id: studentId },
    });
    return removed.count > 0;
  } catch {
    return false;
  }
}

/** Drops every remembered device of a guardian. */
async function forgetTokens(guardianId: number): Promise<void> {
  await prisma.authRememberToken
    .deleteMany({ where: { user_type: 'guardian', user_id: guardianId } })
    .catch(() => null);
}

export async function resetGuardianPassword(guardianId: number): Promise<GuardianOutcome> {
  const guardian = await safe(
    () => prisma.guardian.findUnique({ where: { id: guardianId }, select: { id: true } }),
    null
  );
  if (!guardian) return fail('error.not_found_body');

  const password = generateTempPassword(10);
  try {
    await prisma.guardian.update({
      where: { id: guardianId },
      data: { password: await hashPassword(password), must_change_password: true },
    });
  } catch {
    return fail('error.generic');
  }
  await forgetTokens(guardianId);

  return { ok: true, message: 'aguardian.reset_done', guardianId, password };
}

export async function setGuardianStatus(
  guardianId: number,
  status: 'active' | 'inactive'
): Promise<GuardianOutcome> {
  try {
    await prisma.guardian.update({ where: { id: guardianId }, data: { status } });
  } catch {
    return fail('error.generic');
  }

  // An open session ends on its next request; a remembered device must not
  // sign back in either.
  if (status === 'inactive') await forgetTokens(guardianId);

  return {
    ok: true,
    message: status === 'active' ? 'aguardian.activated' : 'aguardian.deactivated',
    guardianId,
  };
}

export async function deleteGuardian(guardianId: number): Promise<GuardianOutcome> {
  await forgetTokens(guardianId);

  // Everything keyed by (user_type, user_id) rather than by a foreign key: those
  // rows would otherwise outlive the account and belong to the next guardian
  // that happened to take the same id.
  await prisma.userPreference
    .deleteMany({ where: { user_type: 'guardian', user_id: guardianId } })
    .catch(() => null);
  await prisma.notification
    .deleteMany({ where: { user_type: 'guardian', user_id: guardianId } })
    .catch(() => null);
  await prisma.passwordReset
    .deleteMany({ where: { user_type: 'guardian', user_id: guardianId } })
    .catch(() => null);

  try {
    // The student links cascade with the row.
    await prisma.guardian.delete({ where: { id: guardianId } });
  } catch {
    return fail('error.generic');
  }

  return { ok: true, message: 'aguardian.deleted' };
}

/** Guardians with their linked children, for the list. */
export async function guardianList(search: string, take: number, skip: number) {
  const term = search.trim();
  const digits = term.replace(/\D+/g, '');

  const where =
    term === ''
      ? {}
      : {
          OR: [
            { name: { contains: term, mode: 'insensitive' as const } },
            { email: { contains: term, mode: 'insensitive' as const } },
            ...(digits !== '' ? [{ phone: { contains: digits } }] : []),
          ],
        };

  const [total, rows] = await Promise.all([
    safe(() => prisma.guardian.count({ where }), 0),
    safe(
      () =>
        prisma.guardian.findMany({
          where,
          orderBy: [{ id: 'desc' }],
          take,
          skip,
          include: {
            guardianStudent_guardian: {
              select: {
                relation: true,
                student: {
                  select: {
                    id: true,
                    name: true,
                    name_bn: true,
                    student_id_no: true,
                    course: true,
                    batch: true,
                  },
                },
              },
            },
          },
        }),
      []
    ),
  ]);

  return { total, rows };
}

export type GuardianRow = Awaited<ReturnType<typeof guardianList>>['rows'][number];
