import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { validateUpload, uniqueFilename, IMAGE_EXTENSIONS } from '@/lib/storage/validate';
import { putFile, deleteFile } from '@/lib/storage/store';

/**
 * Course management, from admin/courses.php.
 *
 * Courses are **institute-wide**; which branches offer one is a separate
 * `branch_courses` mapping. That is why a branch-locked admin does not edit
 * courses at all (the page is not on their allow-list): a course's name, fee and
 * description are shared, and one branch editing them changes the public site for
 * every branch.
 *
 * Two rules worth keeping in view:
 *
 *   1. **`name` is NOT NULL and older pages read it**, so a course given only a
 *      Bangla title stores that Bangla title in `name` as well. Leaving it empty
 *      would blank the course out of every legacy screen.
 *   2. **A course in use is never deleted.** Enrolments and applications point at
 *      it by id; removing it would orphan a student's record of what they paid
 *      for. It is made inactive instead.
 */

export type CourseType = 'online' | 'offline' | 'hybrid';

export interface CourseInput {
  id: number;
  name: string;
  name_bn: string;
  course_type: string;
  short_description: string;
  short_description_bn: string;
  description: string;
  description_bn: string;
  fee: string;
  duration: string;
  duration_bn: string;
  batch_info: string;
  batch_info_bn: string;
  teacher_id: number;
  instructor_name: string;
  status: string;
  enrollment_status: string;
  is_featured: boolean;
  sort_order: number;
  /** The image the admin just chose, if any. */
  image: File | null;
  removeImage: boolean;
  /** Present only when the form carried the branch field at all. */
  branches: number[] | null;
}

export interface CourseOutcome {
  ok: boolean;
  /** A translation key, or '' when `text` is set. */
  message: string;
  vars?: Record<string, string | number>;
  /** An already-translated message — upload errors arrive translated. */
  text?: string;
  courseId?: number;
}

const fail = (message: string, vars?: Record<string, string | number>): CourseOutcome => ({
  ok: false,
  message,
  vars,
});

/** Only ever removes a file that lives in a course image folder. */
async function deleteCourseImage(path: string | null | undefined): Promise<void> {
  const clean = String(path ?? '').replace(/^\/+/, '');
  // Deliberately narrow: this function is called with a value out of the
  // database, and a stored path that pointed somewhere else must not make it
  // delete somewhere else.
  if (clean.startsWith('uploads/courses/') || clean.startsWith('images/courses/')) {
    await deleteFile(clean);
  }
}

export async function saveCourse(input: CourseInput): Promise<CourseOutcome> {
  const id = Number(input.id) || 0;

  const name = input.name.trim().slice(0, 255);
  const nameBn = input.name_bn.trim().slice(0, 255);
  const fee = input.fee.trim();

  if (name === '' && nameBn === '') return fail('admin.courses.err_name');
  if (fee !== '' && (Number.isNaN(Number(fee)) || Number(fee) < 0)) {
    return fail('admin.courses.err_fee');
  }

  if (input.teacher_id > 0) {
    const teacher = await prisma.teacher
      .findUnique({ where: { id: input.teacher_id }, select: { id: true } })
      .catch(() => null);
    if (!teacher) return fail('admin.courses.err_teacher');
  }

  let existing: { id: number; image: string | null } | null = null;
  if (id > 0) {
    existing = await prisma.course
      .findUnique({ where: { id }, select: { id: true, image: true } })
      .catch(() => null);
    if (!existing) return fail('admin.courses.not_found');
  }

  // The image is validated and written before the row, so a rejected file never
  // reaches the database — and removed again if the row then fails.
  let newImage: string | null = null;
  if (input.image && input.image.size > 0) {
    const check = await validateUpload(input.image, IMAGE_EXTENSIONS, 5 * 1024 * 1024);
    if (!check.ok) return { ok: false, message: '', text: check.error };

    const stored = await putFile(
      'uploads/courses',
      uniqueFilename(check.ext, 'course'),
      check.bytes ?? Buffer.alloc(0),
      check.mime
    );
    if (stored === null) return fail('upload.save_failed');
    newImage = stored;
  }

  const image = newImage ?? (input.removeImage ? '' : (existing?.image ?? ''));

  const data = {
    // A Bangla-only course keeps its Bangla title in `name` too.
    name: name !== '' ? name : nameBn,
    name_bn: nameBn !== '' ? nameBn : null,
    course_type: (['online', 'offline', 'hybrid'] as const).includes(input.course_type as CourseType)
      ? (input.course_type as CourseType)
      : 'offline',
    short_description: input.short_description.trim().slice(0, 500) || null,
    short_description_bn: input.short_description_bn.trim().slice(0, 500) || null,
    description: input.description.trim(),
    description_bn: input.description_bn.trim() || null,
    fee: fee === '' ? null : Math.round(Number(fee) * 100) / 100,
    duration: input.duration.trim().slice(0, 100) || null,
    duration_bn: input.duration_bn.trim().slice(0, 100) || null,
    batch_info: input.batch_info.trim().slice(0, 255) || null,
    batch_info_bn: input.batch_info_bn.trim().slice(0, 255) || null,
    teacher_id: input.teacher_id > 0 ? input.teacher_id : null,
    instructor_name: input.instructor_name.trim().slice(0, 255) || null,
    status: input.status === 'inactive' ? ('inactive' as const) : ('active' as const),
    enrollment_status: input.enrollment_status === 'closed' ? ('closed' as const) : ('open' as const),
    is_featured: input.is_featured,
    sort_order: input.sort_order,
    image,
  };

  let courseId = id;
  try {
    if (existing) {
      await prisma.course.update({ where: { id: existing.id }, data });
      // The old file goes only after the row points at the new one.
      if (image !== (existing.image ?? '') && existing.image) {
        await deleteCourseImage(existing.image);
      }
    } else {
      const created = await prisma.course.create({ data, select: { id: true } });
      courseId = created.id;
    }
  } catch {
    if (newImage !== null) await deleteCourseImage(newImage);
    return fail('error.generic');
  }

  // Which branches offer this course. Only touched when the form carried the
  // field, so a single-branch install never wipes its own mapping.
  if (input.branches !== null) {
    await setCourseBranches(courseId, input.branches);
  }

  return {
    ok: true,
    message: existing ? 'admin.courses.saved' : 'admin.courses.created',
    courseId,
  };
}

/** Replaces the branch offerings of a course with exactly this set. */
export async function setCourseBranches(courseId: number, branchIds: number[]): Promise<void> {
  // Every id is checked against a real branch: the list comes from checkboxes.
  const valid = await prisma.branch
    .findMany({ where: { id: { in: branchIds } }, select: { id: true } })
    .catch(() => []);
  const keep = valid.map((branch) => branch.id);

  try {
    // One transaction: the removals and re-offers land together, so a failure
    // part-way cannot leave the course withdrawn from branches it still has.
    await prisma.$transaction([
      prisma.branchCourse.deleteMany({
        where: { course_id: courseId, ...(keep.length > 0 ? { branch_id: { notIn: keep } } : {}) },
      }),
      // Re-offering a course that was withdrawn reactivates the same row rather
      // than creating a second one.
      ...keep.map((branchId) =>
        prisma.branchCourse.upsert({
          where: { branch_id_course_id: { branch_id: branchId, course_id: courseId } },
          create: { branch_id: branchId, course_id: courseId, status: 'active' },
          update: { status: 'active' },
        })
      ),
    ]);
  } catch {
    // The course itself is saved; a failed mapping is reported by the page
    // showing the ticks as they actually are.
  }
}

export type CourseToggle = 'status' | 'enrollment' | 'featured';

export async function toggleCourse(courseId: number, what: CourseToggle): Promise<CourseOutcome> {
  const course = await prisma.course
    .findUnique({
      where: { id: courseId },
      select: { status: true, enrollment_status: true, is_featured: true },
    })
    .catch(() => null);
  if (!course) return fail('admin.courses.not_found');

  const data =
    what === 'status'
      ? { status: course.status === 'active' ? ('inactive' as const) : ('active' as const) }
      : what === 'enrollment'
        ? {
            enrollment_status:
              course.enrollment_status === 'open' ? ('closed' as const) : ('open' as const),
          }
        : { is_featured: !course.is_featured };

  try {
    await prisma.course.update({ where: { id: courseId }, data });
  } catch {
    return fail('error.generic');
  }
  return { ok: true, message: 'admin.courses.toggled' };
}

export async function deleteCourse(courseId: number): Promise<CourseOutcome> {
  const course = await prisma.course
    .findUnique({ where: { id: courseId }, select: { id: true, image: true } })
    .catch(() => null);
  if (!course) return fail('admin.courses.not_found');

  // Enrolments and applications point at the course by id. Deleting it would
  // orphan a student's record of what they paid for.
  const [enrollments, admissions] = await Promise.all([
    prisma.enrollment.count({ where: { course_id: courseId } }).catch(() => 0),
    prisma.admission.count({ where: { course_id: courseId } }).catch(() => 0),
  ]);
  const linked = enrollments + admissions;
  if (linked > 0) return fail('admin.courses.delete_blocked', { n: linked });

  try {
    await prisma.course.delete({ where: { id: courseId } });
  } catch {
    return fail('error.generic');
  }
  await deleteCourseImage(course.image);

  return { ok: true, message: 'admin.courses.deleted' };
}

/**
 * The course list with the three counts the page shows.
 *
 * `mismatched` is the interesting one: an offline course with an online batch (or
 * the reverse) is almost always a mistake made while setting up, and it shows on
 * the public site as a course you cannot actually join the way it says.
 */
export async function courseList(search: string, type: string) {
  const where: Record<string, unknown> = {};
  if (search.trim() !== '') {
    where.OR = [
      { name: { contains: search.trim(), mode: 'insensitive' } },
      { name_bn: { contains: search.trim(), mode: 'insensitive' } },
    ];
  }
  if ((['online', 'offline', 'hybrid'] as const).includes(type as CourseType)) {
    where.course_type = type;
  }

  const courses = await prisma.course
    .findMany({
      where,
      orderBy: [{ sort_order: 'asc' }, { id: 'desc' }],
      include: {
        teacher: { select: { id: true, name: true, name_bn: true } },
        batch_course: { select: { id: true, status: true, batch_type: true } },
        enrollment_course: { where: { status: 'active' }, select: { id: true } },
        branchCourse_course: { where: { status: 'active' }, select: { branch_id: true } },
      },
    })
    .catch(() => []);

  return courses.map((course) => {
    const activeBatches = course.batch_course.filter((batch) => batch.status === 'active');
    return {
      ...course,
      activeBatches: activeBatches.length,
      mismatched:
        course.course_type === 'hybrid'
          ? 0
          : activeBatches.filter((batch) => batch.batch_type !== course.course_type).length,
      enrolled: course.enrollment_course.length,
      branchIds: course.branchCourse_course.map((row) => row.branch_id),
    };
  });
}

export type AdminCourse = Awaited<ReturnType<typeof courseList>>[number];
