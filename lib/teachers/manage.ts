import 'server-only';
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { validateUpload, uniqueFilename, IMAGE_EXTENSIONS } from '@/lib/storage/validate';
import { putFile, deleteFile } from '@/lib/storage/store';
import { normaliseStoredPath } from '@/lib/storage/url';
import { normaliseBdPhone } from '@/lib/auth/phone';
import { passwordStrengthError } from '@/lib/auth/reset';

/**
 * Teacher accounts, from admin/teachers_management.php.
 *
 * A teacher record is two things at once: **a login** for the teacher portal and
 * **a public profile** for the homepage's "Director & Teachers" section. That is
 * why the form carries Bangla fields and a sort order next to the password.
 *
 * Three rules from the original, each with a reason:
 *
 *   1. **A password hash is never read into the page.** Changing a password
 *      writes a new hash; it never displays or compares the old one.
 *   2. **Deactivating or deleting drops the "keep me signed in" tokens.** An
 *      account that can no longer sign in must not still have a device that can.
 *   3. **Deleting a teacher keeps their classes and exams**, clearing only the
 *      link. A term's papers do not disappear because somebody left.
 */

export interface TeacherOutcome {
  ok: boolean;
  /** A translation key; '' when `text` carries an already-translated message. */
  message: string;
  /** An already-translated message — upload errors arrive translated. */
  text?: string;
  vars?: Record<string, string | number>;
  /** Which field the message belongs to. */
  field?: string;
  teacherId?: number;
  /** A temporary password, shown once and never stored in readable form. */
  password?: string;
}

const fail = (message: string, field?: string, vars?: Record<string, string | number>): TeacherOutcome => ({
  ok: false,
  message,
  field,
  vars,
});

/** A readable temporary password: no ambiguous characters, letters and digits. */
export function generatePassword(length = 10): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;

  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  for (let i = 2; i < length; i++) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * The password rules, from atch_password_error().
 *
 * Length, a letter, a digit, and then the shared "too common" list the reset
 * flow also uses — so a teacher's password is held to the same standard as a
 * student's, whoever sets it.
 *
 * Returns a translation key, or null when the password is acceptable.
 */
export async function passwordError(password: string): Promise<string | null> {
  if (password.length < 8) return 'atch.pw_short';
  if (password.length > 200) return 'atch.pw_long';
  if (!/[A-Za-z]/.test(password)) return 'atch.pw_letter';
  if (!/\d/.test(password)) return 'atch.pw_number';
  if ((await passwordStrengthError(password)) !== null) return 'atch.pw_common';
  return null;
}

/** "Physics, Chemistry" → ['Physics', 'Chemistry'], trimmed and deduplicated. */
export function splitList(value: string): string[] {
  const seen = new Map<string, string>();
  for (const part of value.split(/[,\n]/)) {
    const clean = part.trim();
    if (clean !== '') seen.set(clean.toLowerCase(), clean);
  }
  return [...seen.values()];
}

export interface TeacherInput {
  id: number;
  name: string;
  email: string;
  phone: string;
  designation: string;
  qualification: string;
  bio: string;
  status: string;
  subjects: string;
  batches: string;
  password: string;
  name_bn: string;
  designation_bn: string;
  qualification_bn: string;
  experience: string;
  experience_bn: string;
  bio_bn: string;
  sort_order: number;
  show_on_website: boolean;
  photo: File | null;
  /** null when the form did not carry the branch field at all. */
  branches: number[] | null;
}

async function removePhoto(path: string | null | undefined): Promise<void> {
  const clean = normaliseStoredPath(path);
  if (clean.startsWith('uploads/teachers/')) await deleteFile(clean);
}

export async function saveTeacher(input: TeacherInput): Promise<TeacherOutcome> {
  const id = Number(input.id) || 0;

  let existing: { id: number; photo: string | null } | null = null;
  if (id > 0) {
    existing = await prisma.teacher
      .findUnique({ where: { id }, select: { id: true, photo: true } })
      .catch(() => null);
    if (!existing) return fail('atch.not_found');
  }

  const name = input.name.trim();
  const email = input.email.trim();

  if (name === '' || name.length > 255) return fail('atch.err_name', 'name');
  if (email === '' || email.length > 255 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail('validation.email', 'email');
  }

  // The email is the teacher's username, so it has to be unique.
  const clash = await prisma.teacher
    .findFirst({
      where: { email, NOT: { id: id > 0 ? id : -1 } },
      select: { id: true },
    })
    .catch(() => null);
  if (clash) return fail('atch.err_email_taken', 'email');

  let phone = input.phone.trim();
  if (phone !== '') {
    const normalised = normaliseBdPhone(phone);
    // null, not '': a bad number must never become an empty stored value.
    if (normalised === null) return fail('validation.phone_bd', 'phone');
    phone = normalised;
  }

  if (input.designation.trim().length > 150) return fail('atch.err_designation', 'designation');
  if (input.qualification.trim().length > 255) {
    return fail('atch.err_qualification', 'qualification');
  }
  if (input.bio.trim().length > 5000 || input.bio_bn.trim().length > 5000) {
    return fail('atch.err_bio', 'bio');
  }

  const limits: [keyof TeacherInput, number][] = [
    ['name_bn', 255],
    ['designation_bn', 150],
    ['qualification_bn', 255],
    ['experience', 200],
    ['experience_bn', 200],
  ];
  for (const [field, max] of limits) {
    if (String(input[field] ?? '').trim().length > max) {
      return fail('atch.err_too_long', field as string, { max });
    }
  }

  const subjects = splitList(input.subjects);
  const batches = splitList(input.batches);
  for (const [field, list] of [
    ['subjects', subjects],
    ['batches', batches],
  ] as const) {
    if (list.length > 30 || list.some((item) => item.length > 150)) {
      return fail('atch.err_list', field);
    }
  }

  let password = existing ? '' : input.password;
  let generated = '';
  if (!existing) {
    if (password !== '') {
      const error = await passwordError(password);
      if (error) return fail(error, 'password');
    } else {
      // No password typed: the server makes one and shows it once.
      password = generatePassword();
      generated = password;
    }
  }

  // The photo is validated before anything is written, and stored only once the
  // rest of the form is known to be good.
  let newPhoto: string | null = null;
  if (input.photo && input.photo.size > 0) {
    const check = await validateUpload(input.photo, IMAGE_EXTENSIONS, 5 * 1024 * 1024);
    // The upload checker returns its message already translated.
    if (!check.ok) return { ok: false, message: '', text: check.error, field: 'photo' };

    const stored = await putFile(
      'uploads/teachers',
      uniqueFilename(check.ext, 'teacher'),
      check.bytes ?? Buffer.alloc(0),
      check.mime
    );
    if (stored === null) return fail('upload.save_failed', 'photo');
    newPhoto = stored;
  }

  const nullable = (value: string) => {
    const clean = value.trim();
    return clean !== '' ? clean : null;
  };

  const profile = {
    name_bn: nullable(input.name_bn),
    designation_bn: nullable(input.designation_bn),
    qualification_bn: nullable(input.qualification_bn),
    experience: nullable(input.experience),
    experience_bn: nullable(input.experience_bn),
    bio_bn: nullable(input.bio_bn),
    sort_order: Math.max(0, Math.min(9999, input.sort_order)),
    show_on_website: input.show_on_website,
  };

  let teacherId = id;
  try {
    if (existing) {
      await prisma.teacher.update({
        where: { id: existing.id },
        data: {
          name,
          email,
          phone: nullable(phone),
          designation: nullable(input.designation),
          qualification: nullable(input.qualification),
          bio: nullable(input.bio),
          status: input.status === 'inactive' ? 'inactive' : 'active',
          photo: newPhoto ?? existing.photo,
          ...profile,
        },
      });
      // The denormalised teacher name on classes has to follow a rename.
      await prisma.liveClass.updateMany({
        where: { teacher_id: existing.id },
        data: { teacher_name: name },
      });
    } else {
      const created = await prisma.teacher.create({
        data: {
          name,
          email,
          phone: nullable(phone),
          password_hash: await hashPassword(password),
          designation: nullable(input.designation),
          qualification: nullable(input.qualification),
          photo: newPhoto,
          bio: nullable(input.bio),
          status: input.status === 'inactive' ? 'inactive' : 'active',
          ...profile,
        },
        select: { id: true },
      });
      teacherId = created.id;
    }

    await syncAssignments('subjects', teacherId, subjects);
    await syncAssignments('batches', teacherId, batches);

    if (input.branches !== null) await setTeacherBranches(teacherId, input.branches);
  } catch {
    if (newPhoto) await removePhoto(newPhoto);
    return fail('error.generic', 'form');
  }

  if (newPhoto && existing?.photo && existing.photo !== newPhoto) {
    await removePhoto(existing.photo);
  }

  return {
    ok: true,
    message: existing ? 'atch.updated' : 'atch.created',
    vars: { name },
    teacherId,
    password: generated !== '' ? generated : undefined,
  };
}

/**
 * Replaces a teacher's subject or batch list with exactly this set.
 *
 * Delete and re-insert are one transaction, with the inserts as a single
 * createMany: a failure half-way used to leave the teacher with an emptied or
 * partial list.
 */
async function syncAssignments(
  what: 'subjects' | 'batches',
  teacherId: number,
  values: string[]
): Promise<void> {
  if (what === 'subjects') {
    await prisma.$transaction([
      prisma.teacherSubject.deleteMany({ where: { teacher_id: teacherId } }),
      prisma.teacherSubject.createMany({
        data: values.map((subject) => ({ teacher_id: teacherId, subject })),
      }),
    ]);
    return;
  }
  await prisma.$transaction([
    prisma.teacherBatch.deleteMany({ where: { teacher_id: teacherId } }),
    prisma.teacherBatch.createMany({
      data: values.map((batch) => ({ teacher_id: teacherId, batch })),
    }),
  ]);
}

/** The branches a teacher works at. */
export async function setTeacherBranches(teacherId: number, branchIds: number[]): Promise<void> {
  const valid = await prisma.branch
    .findMany({ where: { id: { in: branchIds } }, select: { id: true } })
    .catch(() => []);

  try {
    // One transaction, one insert: never a teacher left with no branch links
    // because the re-insert failed after the delete.
    await prisma.$transaction([
      prisma.branchTeacher.deleteMany({ where: { teacher_id: teacherId } }),
      prisma.branchTeacher.createMany({
        data: valid.map((branch) => ({ branch_id: branch.id, teacher_id: teacherId })),
      }),
    ]);
  } catch {
    // The teacher is saved; the branch links can be set again.
  }
}

/**
 * Sets a new password, or generates one when the field is left blank.
 *
 * Every remembered device is dropped at the same time: a password change that
 * leaves an old session signed in has not really changed anything.
 */
export async function setTeacherPassword(
  teacherId: number,
  password: string
): Promise<TeacherOutcome> {
  const teacher = await prisma.teacher
    .findUnique({ where: { id: teacherId }, select: { id: true, name: true } })
    .catch(() => null);
  if (!teacher) return fail('atch.not_found');

  let value = password;
  let generated = '';
  if (value === '') {
    value = generatePassword();
    generated = value;
  } else {
    const error = await passwordError(value);
    if (error) return fail(error, 'password');
  }

  try {
    await prisma.teacher.update({
      where: { id: teacherId },
      data: { password_hash: await hashPassword(value) },
    });
    await prisma.authRememberToken.deleteMany({
      where: { user_type: 'teacher', user_id: teacherId },
    });
  } catch {
    return fail('error.generic');
  }

  return {
    ok: true,
    message: 'atch.password_changed',
    vars: { name: teacher.name },
    password: generated !== '' ? generated : undefined,
  };
}

export async function toggleTeacher(teacherId: number): Promise<TeacherOutcome> {
  const teacher = await prisma.teacher
    .findUnique({ where: { id: teacherId }, select: { id: true, name: true, status: true } })
    .catch(() => null);
  if (!teacher) return fail('atch.not_found');

  const next = teacher.status === 'active' ? 'inactive' : 'active';
  try {
    await prisma.teacher.update({ where: { id: teacherId }, data: { status: next } });
    if (next === 'inactive') {
      // No signed-in device survives a deactivation.
      await prisma.authRememberToken.deleteMany({
        where: { user_type: 'teacher', user_id: teacherId },
      });
    }
  } catch {
    return fail('error.generic');
  }

  return {
    ok: true,
    message: next === 'active' ? 'atch.activated' : 'atch.deactivated',
    vars: { name: teacher.name },
  };
}

export async function deleteTeacher(teacherId: number): Promise<TeacherOutcome> {
  const teacher = await prisma.teacher
    .findUnique({ where: { id: teacherId }, select: { id: true, name: true, photo: true } })
    .catch(() => null);
  if (!teacher) return fail('atch.not_found');

  try {
    // Classes and exams are kept; only the teacher link is cleared, so a term's
    // papers survive somebody leaving. One transaction: if the delete fails,
    // the classes and exams keep their teacher instead of being orphaned from
    // a teacher who still exists.
    await prisma.$transaction([
      prisma.liveClass.updateMany({ where: { teacher_id: teacherId }, data: { teacher_id: null } }),
      prisma.exam.updateMany({ where: { teacher_id: teacherId }, data: { teacher_id: null } }),
      prisma.authRememberToken.deleteMany({ where: { user_type: 'teacher', user_id: teacherId } }),
      prisma.teacher.delete({ where: { id: teacherId } }),
    ]);
  } catch {
    return fail('error.generic');
  }

  await removePhoto(teacher.photo);
  return { ok: true, message: 'atch.deleted', vars: { name: teacher.name } };
}

/** Show or hide a teacher on the public homepage. */
export async function toggleWebsite(teacherId: number): Promise<TeacherOutcome> {
  const teacher = await prisma.teacher
    .findUnique({ where: { id: teacherId }, select: { id: true, name: true, show_on_website: true } })
    .catch(() => null);
  if (!teacher) return fail('atch.not_found');

  try {
    await prisma.teacher.update({
      where: { id: teacherId },
      data: { show_on_website: !teacher.show_on_website },
    });
  } catch {
    return fail('error.generic');
  }

  return {
    ok: true,
    message: teacher.show_on_website ? 'atch.hidden_web' : 'atch.shown_web',
    vars: { name: teacher.name },
  };
}
