'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { getLang, translate, hasTranslation } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import {
  saveCourse,
  toggleCourse,
  deleteCourse,
  type CourseOutcome,
  type CourseToggle,
} from '@/lib/courses/manage';
import { emptyCourseState } from './state';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * The course actions, from the POST block of admin/courses.php.
 *
 * Courses are institute-wide, so this page is not on the branch admin
 * allow-list; `requireAdmin()` plus that list is the gate, enforced by
 * `AdminPage` before the page renders.
 *
 * Saving revalidates the public site as well as the admin list — a course's
 * title, price and status are all on pages visitors see.
 */

export interface CourseState {
  error: string;
  message: string;
}


function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

async function present(outcome: CourseOutcome): Promise<CourseState> {
  if (outcome.text !== undefined && outcome.text !== '') {
    return outcome.ok ? { error: '', message: outcome.text } : { error: outcome.text, message: '' };
  }

  const lang = await getLang();
  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(outcome.vars ?? {})) {
    vars[name] =
      typeof value === 'number'
        ? toLocalDigits(value, lang)
        : hasTranslation(value)
          ? translate(lang, value)
          : value;
  }
  const message = translate(lang, outcome.message, vars);
  return outcome.ok ? { error: '', message } : { error: message, message: '' };
}

function refresh(): void {
  revalidatePath('/admin/courses');
  invalidate(TAGS.courses);
  // The public pages show courses and their batches.
  revalidatePath('/');
  revalidatePath('/courses');
  revalidatePath('/online-classes');
}

export async function saveCourseAction(
  _prev: CourseState,
  formData: FormData
): Promise<CourseState> {
  await requireAdmin();

  const image = formData.get('image');
  // The branch field is present only when the form showed it; null means
  // "leave the mapping alone" rather than "no branches".
  const branches =
    formData.get('branches_field') !== null
      ? formData
          .getAll('branches')
          .map((value) => Number(value))
          .filter((id) => Number.isInteger(id) && id > 0)
      : null;

  const outcome = await saveCourse({
    id: Number(formData.get('course_id') ?? 0),
    name: text(formData, 'name'),
    name_bn: text(formData, 'name_bn'),
    course_type: text(formData, 'course_type'),
    short_description: text(formData, 'short_description'),
    short_description_bn: text(formData, 'short_description_bn'),
    description: text(formData, 'description'),
    description_bn: text(formData, 'description_bn'),
    fee: text(formData, 'fee'),
    duration: text(formData, 'duration'),
    duration_bn: text(formData, 'duration_bn'),
    batch_info: text(formData, 'batch_info'),
    batch_info_bn: text(formData, 'batch_info_bn'),
    teacher_id: Number(formData.get('teacher_id') ?? 0),
    instructor_name: text(formData, 'instructor_name'),
    status: text(formData, 'status'),
    enrollment_status: text(formData, 'enrollment_status'),
    is_featured: formData.get('is_featured') !== null,
    sort_order: Number(formData.get('sort_order') ?? 0) || 0,
    image: image instanceof File ? image : null,
    removeImage: formData.get('remove_image') !== null,
    branches,
  });

  if (!outcome.ok) return present(outcome);

  refresh();

  // A newly created course has no batch yet, so the useful next screen is its
  // own edit page with the "add a batch" hint on it.
  if (Number(formData.get('course_id') ?? 0) === 0 && outcome.courseId !== undefined) {
    redirect(`/admin/courses?edit=${outcome.courseId}`);
  }

  return present(outcome);
}

export async function toggleCourseAction(
  _prev: CourseState,
  formData: FormData
): Promise<CourseState> {
  await requireAdmin();

  const what = text(formData, 'what');
  if (!['status', 'enrollment', 'featured'].includes(what)) return emptyCourseState;

  const outcome = await toggleCourse(Number(formData.get('course_id') ?? 0), what as CourseToggle);
  refresh();
  return present(outcome);
}

export async function deleteCourseAction(
  _prev: CourseState,
  formData: FormData
): Promise<CourseState> {
  await requireAdmin();

  const outcome = await deleteCourse(Number(formData.get('course_id') ?? 0));
  refresh();
  return present(outcome);
}
