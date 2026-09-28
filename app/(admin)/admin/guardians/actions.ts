'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { formatPhone } from '@/lib/site/url';
import { normaliseBdPhone } from '@/lib/auth/phone';
import {
  guardianByPhone,
  studentsForPhone,
  defaultName,
  createGuardian,
  linkStudent,
  unlinkStudent,
  resetGuardianPassword,
  setGuardianStatus,
  deleteGuardian,
  RELATIONS,
} from '@/lib/guardians/manage';

/**
 * Guardian account actions, from admin/guardians.php.
 *
 * **Creating from a phone number is the main path**: one number, one account,
 * every sibling linked. Creating one by hand exists for the case where a
 * guardian's number is not on any student record yet.
 *
 * A temporary password comes back in the state and is shown once — it is stored
 * only as a hash.
 */

export interface GuardianState {
  error: string;
  message: string;
  password: string;
  phone: string;
  guardianId: number;
}

function refresh(): void {
  revalidatePath('/admin/guardians');
  revalidatePath('/admin/students');
}

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

const blank: GuardianState = { error: '', message: '', password: '', phone: '', guardianId: 0 };

/** One account for a phone number, with every student that carries it linked. */
export async function createFromPhoneAction(
  _prev: GuardianState,
  formData: FormData
): Promise<GuardianState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const phone = normaliseBdPhone(text(formData, 'phone'));
  const students = phone !== null ? await studentsForPhone(phone) : [];

  if (phone === null || students.length === 0) {
    return { ...blank, error: translate(lang, 'aguardian.err_no_students') };
  }

  const { name, relation } = defaultName(students);
  const existing = await guardianByPhone(phone);

  // An account for this number already exists: link the students to it rather
  // than making a second account for the same parent.
  if (existing) {
    let linked = 0;
    for (const student of students) {
      if (await linkStudent(existing.id, student.id, relation)) linked++;
    }
    refresh();
    return {
      ...blank,
      guardianId: existing.id,
      message: translate(lang, 'aguardian.linked_existing', {
        count: toLocalDigits(linked, lang),
        phone: formatPhone(phone),
      }),
    };
  }

  const created = await createGuardian(phone, name, null, admin.id);
  if (!created) return { ...blank, error: translate(lang, 'error.generic') };

  for (const student of students) {
    await linkStudent(created.id, student.id, relation);
  }

  refresh();
  return {
    error: '',
    message: translate(lang, 'aguardian.created', {
      count: toLocalDigits(students.length, lang),
    }),
    password: created.password,
    phone: formatPhone(phone),
    guardianId: created.id,
  };
}

/** An account typed in by hand, optionally linked to one student by ID. */
export async function createManualAction(
  _prev: GuardianState,
  formData: FormData
): Promise<GuardianState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const phone = normaliseBdPhone(text(formData, 'phone'));
  if (phone === null) return { ...blank, error: translate(lang, 'aguardian.err_phone') };

  const email = text(formData, 'email').trim();
  if (email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ...blank, error: translate(lang, 'aguardian.err_email') };
  }

  const existing = await guardianByPhone(phone);
  if (existing) {
    return {
      ...blank,
      guardianId: existing.id,
      error: translate(lang, 'aguardian.err_exists'),
    };
  }

  // The reference is a Student ID, because that is what an admin has in front of
  // them — a number nobody recognises would be a worse thing to ask for.
  const reference = text(formData, 'student_ref').trim();
  let student: { id: number } | null = null;
  if (reference !== '') {
    student = await prisma.student
      .findFirst({ where: { student_id_no: reference }, select: { id: true } })
      .catch(() => null);
    if (!student) {
      return {
        ...blank,
        error: translate(lang, 'aguardian.err_student_ref', { id: reference }),
      };
    }
  }

  const created = await createGuardian(phone, text(formData, 'name'), email, admin.id);
  if (!created) return { ...blank, error: translate(lang, 'error.generic') };

  if (student) await linkStudent(created.id, student.id, 'guardian');

  refresh();
  return {
    error: '',
    message: translate(lang, 'aguardian.created', {
      count: toLocalDigits(student ? 1 : 0, lang),
    }),
    password: created.password,
    phone: formatPhone(phone),
    guardianId: created.id,
  };
}

export async function linkStudentAction(
  _prev: GuardianState,
  formData: FormData
): Promise<GuardianState> {
  await requireAdmin();
  const lang = await getLang();

  const guardianId = Number(formData.get('guardian_id') ?? 0);
  const studentId = Number(formData.get('student_id') ?? 0);

  const [guardian, student] = await Promise.all([
    prisma.guardian.findUnique({ where: { id: guardianId }, select: { name: true } }).catch(() => null),
    prisma.student
      .findUnique({
        where: { id: studentId },
        select: { id: true, name: true, father_name: true, mother_name: true },
      })
      .catch(() => null),
  ]);
  if (!guardian || !student) return { ...blank, error: translate(lang, 'error.not_found_body') };

  let relation = text(formData, 'relation');
  if (!(RELATIONS as readonly string[]).includes(relation)) {
    // Guess from the names on the student's record, which is usually right and
    // always better than leaving the relation blank.
    const guardianName = (guardian.name ?? '').trim().toLowerCase();
    relation = 'guardian';
    if (guardianName !== '' && guardianName === (student.father_name ?? '').trim().toLowerCase()) {
      relation = 'father';
    } else if (
      guardianName !== '' &&
      guardianName === (student.mother_name ?? '').trim().toLowerCase()
    ) {
      relation = 'mother';
    }
  }

  await linkStudent(guardianId, studentId, relation);
  refresh();

  return {
    ...blank,
    guardianId,
    message: translate(lang, 'aguardian.linked', { name: student.name }),
  };
}

export async function unlinkStudentAction(
  _prev: GuardianState,
  formData: FormData
): Promise<GuardianState> {
  await requireAdmin();
  const lang = await getLang();

  const guardianId = Number(formData.get('guardian_id') ?? 0);
  await unlinkStudent(guardianId, Number(formData.get('student_id') ?? 0));

  refresh();
  return { ...blank, guardianId, message: translate(lang, 'aguardian.unlinked') };
}

export async function updateGuardianAction(
  _prev: GuardianState,
  formData: FormData
): Promise<GuardianState> {
  await requireAdmin();
  const lang = await getLang();

  const guardianId = Number(formData.get('guardian_id') ?? 0);
  const phone = normaliseBdPhone(text(formData, 'phone'));
  if (phone === null) return { ...blank, guardianId, error: translate(lang, 'aguardian.err_phone') };

  const email = text(formData, 'email').trim();
  if (email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ...blank, guardianId, error: translate(lang, 'aguardian.err_email') };
  }

  // The phone number is the username, so it cannot collide with another account.
  const other = await guardianByPhone(phone);
  if (other && other.id !== guardianId) {
    return { ...blank, guardianId, error: translate(lang, 'aguardian.err_exists') };
  }

  const name = text(formData, 'name').trim().slice(0, 255);
  try {
    await prisma.guardian.update({
      where: { id: guardianId },
      data: {
        phone,
        name: name !== '' ? name : null,
        email: email !== '' ? email.slice(0, 255) : null,
      },
    });
  } catch {
    return { ...blank, guardianId, error: translate(lang, 'error.generic') };
  }

  refresh();
  return { ...blank, guardianId, message: translate(lang, 'aguardian.saved') };
}

export async function resetPasswordAction(
  _prev: GuardianState,
  formData: FormData
): Promise<GuardianState> {
  await requireAdmin();
  const lang = await getLang();

  const guardianId = Number(formData.get('guardian_id') ?? 0);
  const outcome = await resetGuardianPassword(guardianId);
  if (!outcome.ok) return { ...blank, guardianId, error: translate(lang, outcome.message) };

  const guardian = await prisma.guardian
    .findUnique({ where: { id: guardianId }, select: { phone: true } })
    .catch(() => null);

  refresh();
  return {
    error: '',
    message: translate(lang, outcome.message),
    password: outcome.password ?? '',
    phone: formatPhone(guardian?.phone ?? ''),
    guardianId,
  };
}

export async function toggleGuardianAction(
  _prev: GuardianState,
  formData: FormData
): Promise<GuardianState> {
  await requireAdmin();
  const lang = await getLang();

  const guardianId = Number(formData.get('guardian_id') ?? 0);
  const guardian = await prisma.guardian
    .findUnique({ where: { id: guardianId }, select: { status: true } })
    .catch(() => null);
  if (!guardian) return { ...blank, error: translate(lang, 'error.not_found_body') };

  const outcome = await setGuardianStatus(
    guardianId,
    guardian.status === 'active' ? 'inactive' : 'active'
  );
  refresh();

  return outcome.ok
    ? { ...blank, guardianId, message: translate(lang, outcome.message) }
    : { ...blank, guardianId, error: translate(lang, outcome.message) };
}

export async function deleteGuardianAction(
  _prev: GuardianState,
  formData: FormData
): Promise<GuardianState> {
  await requireAdmin();
  const lang = await getLang();

  const outcome = await deleteGuardian(Number(formData.get('guardian_id') ?? 0));
  refresh();

  return outcome.ok
    ? { ...blank, message: translate(lang, outcome.message) }
    : { ...blank, error: translate(lang, outcome.message) };
}
