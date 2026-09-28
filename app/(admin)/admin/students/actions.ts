'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate, type Lang } from '@/lib/i18n';
import { recordBranchId } from '@/lib/branch/assign';
import { ensureStudentId } from '@/lib/students/id';

/**
 * The student list's two actions, from the POST block of admin/students.php.
 *
 * Neither of them deletes a student — that lives on the profile page, behind its
 * own confirmation, because a student carries results, payments and attendance.
 *
 * **Both re-check the branch of the student being changed**, not the branch in
 * the form: a branch-locked admin editing an id from another branch is refused
 * rather than quietly moving that student to their own branch.
 */

export interface StudentFormState {
  error: string;
  message: string;
}


function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

function fail(lang: Lang, key: string, vars?: Record<string, string | number>): StudentFormState {
  return { error: translate(lang, key, vars), message: '' };
}

export async function saveStudentAction(
  _prev: StudentFormState,
  formData: FormData
): Promise<StudentFormState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('student_id') ?? 0);
  if (!Number.isInteger(id) || id <= 0) return fail(lang, 'astd.not_found');

  const student = await prisma.student
    .findUnique({ where: { id }, select: { id: true, name: true, branch_id: true } })
    .catch(() => null);
  if (!student) return fail(lang, 'astd.not_found');

  // The student must already be in this admin's branch before anything is
  // written. Throws for a branch admin reaching outside their own branch.
  await requireRecordBranch('students', id, false);

  const name = text(formData, 'name').trim();
  const nameBn = text(formData, 'name_bn').trim();
  const roll = text(formData, 'roll_number').trim();
  const batchId = Number(formData.get('batch_id') ?? 0);
  const status = text(formData, 'student_status');

  if (name === '' || name.length > 255) return fail(lang, 'astd.err_name');
  if (nameBn.length > 255) return fail(lang, 'astd.err_name_bn');
  if (roll.length > 20) return fail(lang, 'astd.err_roll');
  if (status !== 'Active' && status !== 'Inactive') return fail(lang, 'astd.err_status');

  const batch =
    batchId > 0
      ? await prisma.batch
          .findUnique({
            where: { id: batchId },
            select: { id: true, name: true, branch_id: true, course: { select: { name: true } } },
          })
          .catch(() => null)
      : null;
  if (batchId > 0 && !batch) return fail(lang, 'astd.err_batch');

  // A locked admin's own branch, whatever the form said.
  const branchId = await recordBranchId(formData.get('branch_id') ?? student.branch_id);

  // A batch belonging to another branch cannot be set on this student: the pair
  // would put the student in one branch and their class in another.
  if (batch && batch.branch_id && batch.branch_id !== branchId) {
    return fail(lang, 'astd.err_batch_branch');
  }

  try {
    await prisma.student.update({
      where: { id },
      data: {
        name,
        name_bn: nameBn !== '' ? nameBn : null,
        roll_number: roll !== '' ? roll : null,
        batch_id: batch ? batch.id : null,
        // The free-text `batch` and `course` columns are kept in step with the
        // chosen batch: older attendance and exam pages still read them, and the
        // student portal's audience rule matches on those NAMES.
        batch: batch ? batch.name : null,
        ...(batch?.course?.name ? { course: batch.course.name } : {}),
        student_status: status,
        branch_id: branchId > 0 ? branchId : null,
      },
    });
  } catch (error) {
    // A duplicate roll within a batch is a unique-key error, and saying so is
    // far more useful than "something went wrong".
    const code = (error as { code?: string }).code;
    return fail(lang, code === 'P2002' ? 'astd.err_duplicate' : 'error.generic');
  }

  revalidatePath('/admin/students');
  revalidatePath(`/admin/students/${id}`);

  return { error: '', message: translate(lang, 'astd.saved', { name }) };
}

/** Issues a Student ID to somebody who predates the feature. */
export async function issueStudentIdAction(
  _prev: StudentFormState,
  formData: FormData
): Promise<StudentFormState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('student_id') ?? 0);
  if (!Number.isInteger(id) || id <= 0) return fail(lang, 'astd.not_found');

  const student = await prisma.student
    .findUnique({ where: { id }, select: { name: true } })
    .catch(() => null);
  if (!student) return fail(lang, 'astd.not_found');

  await requireRecordBranch('students', id, false);

  try {
    const newId = await ensureStudentId(id);
    revalidatePath('/admin/students');
    return {
      error: '',
      message: translate(lang, 'astd.id_issued', { name: student.name, id: newId }),
    };
  } catch {
    return fail(lang, 'error.generic');
  }
}
