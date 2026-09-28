import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { safeUrl } from '@/lib/site/url';
import { validateUpload, uniqueFilename, IMAGE_EXTENSIONS, DOCUMENT_EXTENSIONS } from '@/lib/storage/validate';
import { putFile, deleteFile } from '@/lib/storage/store';
import { studentScopes, scopeOpenWhere, scopeMatches } from '@/lib/student/scope';
import { translate, hasTranslation, isLang, type Lang } from '@/lib/i18n';
import { formatDate, toLocalDigits } from '@/lib/i18n/format';
import { setting } from '@/lib/settings';
import {
  cleanDate,
  cleanTime,
  dateValue,
  timeValue,
  isClassStatus,
  startOf,
  type ClassStatus,
} from './data';

/**
 * Scheduling and changing live classes — orbit_live_class_handle_post() and the
 * functions it calls, from includes/live_class_lib.php.
 *
 * Shared by the teacher screen and (later) the admin one. **`lockTeacherId` is
 * the difference**: when it is set, only that teacher's own classes can be
 * touched and a new class is assigned to them. The teacher screen always sets
 * it; the admin screen never does.
 *
 * Two things here are easy to get wrong and both are load-bearing:
 *
 *   1. The form sends course and batch **ids**, but the table stores **names**,
 *      because that is what the student audience rule matches on. Resolving one
 *      to the other is `resolveAudience()`, and a batch that does not belong to
 *      the chosen course is refused rather than stored — a batch name such as
 *      "Online Batch" exists in several courses, and storing the wrong pairing
 *      shows one course's class to another's students.
 *   2. Students are notified only about the changes that affect whether they can
 *      attend: a new class, a new time, a new link, a cancellation, a new
 *      handout. A corrected typo in a topic does not message a whole batch.
 */

const MATERIAL_MB = 25;
const MIN_DURATION = 5;
const MAX_DURATION = 600;

export interface ClassInput {
  id: number;
  subject: string;
  topic: string;
  /** '' = every course, a courses.id, or '__keep' for a free-text value. */
  course_id: string;
  /** '' = every batch of the course, a batches.id, or '__keep'. */
  batch_id: string;
  class_mode: string;
  class_date: string;
  start_time: string;
  duration_minutes: string;
  meet_url: string;
  description: string;
  status: string;
  teacher_id: number;
  branch_id: number | null;
}

export interface ClassOutcome {
  ok: boolean;
  /** A translation key; '' when `text` carries an already-translated message. */
  message: string;
  /** Variables for `message`. */
  vars?: Record<string, string | number>;
  /** An already-translated message (upload errors arrive translated). */
  text?: string;
  /** How many students were told, for the "…, N students notified" suffix. */
  notified?: number;
  classId?: number;
}

const fail = (message: string, vars?: Record<string, string | number>): ClassOutcome => ({
  ok: false,
  message,
  vars,
});

type ClassRow = NonNullable<Awaited<ReturnType<typeof prisma.liveClass.findUnique>>>;

/**
 * The class, if this actor may change it.
 *
 * 'forbidden' is kept distinct from null so the teacher sees "not yours" rather
 * than "not found" when they own no such class — the original's two messages.
 */
async function loadOwned(
  classId: number,
  lockTeacherId?: number
): Promise<ClassRow | null | 'forbidden'> {
  if (!Number.isInteger(classId) || classId <= 0) return null;
  try {
    const row = await prisma.liveClass.findUnique({ where: { id: classId } });
    if (!row) return null;
    if (lockTeacherId !== undefined && row.teacher_id !== lockTeacherId) return 'forbidden';
    return row;
  } catch {
    return null;
  }
}

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();

interface Audience {
  course: string | null;
  batch: string | null;
  batch_id: number | null;
}

/**
 * Turns the form's course / batch choices into what is stored —
 * orbit_live_class_resolve_audience().
 *
 * Returns a translation key instead of an audience when the pairing is not one
 * that exists. Refusing here is the point: a batch stored under the wrong course
 * is invisible in the UI and wrong for as long as the class lives.
 */
async function resolveAudience(
  courseSel: string,
  batchSel: string,
  before: ClassRow | null
): Promise<Audience | { error: string }> {
  let course: string | null = null;
  let courseId = 0;
  let batch: string | null = null;
  let batchId: number | null = null;

  if (courseSel === '__keep') {
    if (!before || (before.course ?? '').trim() === '') return { error: 'lcl.err.course' };
    course = before.course;
  } else if (courseSel !== '') {
    if (!/^\d+$/.test(courseSel)) return { error: 'lcl.err.course' };
    const row = await prisma.course.findUnique({
      where: { id: Number(courseSel) },
      select: { id: true, name: true },
    });
    if (!row) return { error: 'lcl.err.course' };
    course = row.name;
    courseId = row.id;
  }

  if (batchSel === '__keep') {
    if (!before || (before.batch ?? '').trim() === '') return { error: 'lcl.err.batch' };
    batch = before.batch;
    batchId = before.batch_id;
  } else if (batchSel !== '') {
    if (!/^\d+$/.test(batchSel)) return { error: 'lcl.err.batch' };
    const row = await prisma.batch.findUnique({
      where: { id: Number(batchSel) },
      select: { id: true, name: true, course_id: true, course: { select: { name: true } } },
    });
    if (!row) return { error: 'lcl.err.batch' };

    const batchCourseName = row.course?.name ?? '';
    if (courseSel === '') {
      // A batch picked with no course: the batch's own course applies, so the
      // class is never addressed by batch name alone across every course.
      if (batchCourseName.trim() === '') return { error: 'lcl.err.course' };
      course = batchCourseName;
    } else if (courseSel === '__keep') {
      if (norm(batchCourseName) !== norm(course)) return { error: 'lcl.err.batch' };
    } else if (row.course_id !== courseId) {
      return { error: 'lcl.err.batch' };
    }
    batch = row.name;
    batchId = row.id;
  }

  return { course, batch, batch_id: batchId };
}

/* --------------------------------------------------------------- save */

export async function saveLiveClass(
  input: ClassInput,
  actorRole: 'teacher' | 'admin',
  actorId: number,
  lockTeacherId?: number
): Promise<ClassOutcome> {
  const id = Number(input.id) || 0;

  let before: ClassRow | null = null;
  if (id > 0) {
    const loaded = await loadOwned(id, lockTeacherId);
    if (loaded === 'forbidden') return fail('lcl.err.not_owner');
    if (loaded === null) return fail(lockTeacherId !== undefined ? 'lcl.err.not_owner' : 'lcl.err.not_found');
    before = loaded;
  }

  const subject = input.subject.trim();
  const topic = input.topic.trim();
  const description = input.description.trim();
  const meetInput = input.meet_url.trim();

  // The validation order is the original's, and nothing is written until all of
  // it passes: a half-saved class with no time would be worse than a refusal.
  if (subject === '') return fail('lcl.err.subject');
  if (subject.length > 150) {
    return fail('lcl.err.too_long', { field: 'common.subject', max: 150 });
  }
  if (topic.length > 255) {
    return fail('lcl.err.too_long', { field: 'lcl.topic', max: 255 });
  }

  const audience = await resolveAudience(input.course_id, input.batch_id, before).catch(() => ({
    error: 'lcl.err.save',
  }));
  if ('error' in audience) return fail(audience.error);

  if (input.class_mode !== 'online' && input.class_mode !== 'offline') return fail('lcl.err.mode');

  const date = cleanDate(input.class_date);
  if (date === null) return fail('lcl.err.date');
  const time = cleanTime(input.start_time);
  if (time === null) return fail('lcl.err.time');

  const duration = /^\d+$/.test(input.duration_minutes.trim())
    ? Number(input.duration_minutes.trim())
    : -1;
  if (duration < MIN_DURATION || duration > MAX_DURATION) {
    return fail('lcl.err.duration', { min: MIN_DURATION, max: MAX_DURATION });
  }

  if (meetInput.length > 500) {
    return fail('lcl.err.too_long', { field: 'lcl.meet_url', max: 500 });
  }
  // `safeUrl` keeps only http(s) absolute URLs, which is what blocks a
  // `javascript:` link being handed to every student as a join button.
  const meet = meetInput === '' ? '' : safeUrl(meetInput);
  if (meetInput !== '' && !/^https?:\/\//i.test(meet)) return fail('lcl.err.meet_url');

  if (description.length > 5000) {
    return fail('lcl.err.too_long', { field: 'common.description', max: 5000 });
  }

  const status: ClassStatus = isClassStatus(input.status) ? input.status : 'scheduled';

  // A teacher always schedules for themselves; an admin picks from the list.
  const teacherId = lockTeacherId !== undefined ? lockTeacherId : Number(input.teacher_id) || 0;
  let teacherName: string | null = null;
  if (teacherId > 0) {
    const teacher = await prisma.teacher
      .findUnique({ where: { id: teacherId }, select: { name: true } })
      .catch(() => null);
    if (!teacher) return fail('lcl.err.teacher');
    teacherName = teacher.name;
  }

  const data = {
    subject,
    topic: topic !== '' ? topic : null,
    teacher_id: teacherId > 0 ? teacherId : null,
    teacher_name: teacherId > 0 ? teacherName : null,
    batch: audience.batch,
    course: audience.course,
    batch_id: audience.batch_id,
    class_mode: input.class_mode as 'online' | 'offline',
    class_date: dateValue(date),
    start_time: timeValue(time),
    duration_minutes: duration,
    description: description !== '' ? description : null,
    meet_url: meet !== '' ? meet : null,
    status,
    branch_id: input.branch_id,
  };

  let classId = id;
  let kind: NotifyKind | null = null;
  let message: string;

  try {
    if (before) {
      await prisma.liveClass.update({ where: { id: before.id }, data });
      classId = before.id;
      message = 'lcl.msg.updated';

      // What changed decides who hears about it.
      if (status === 'cancelled' && before.status !== 'cancelled') {
        kind = 'cancel';
      } else if (status === 'scheduled') {
        if (
          before.status === 'cancelled' ||
          norm(before.course) !== norm(audience.course) ||
          norm(before.batch) !== norm(audience.batch)
        ) {
          // Back on, or now shown to a different audience: the people who can
          // see it may never have been told it existed.
          kind = 'new';
        } else if (
          before.class_date.getTime() !== data.class_date.getTime() ||
          before.start_time.getTime() !== data.start_time.getTime()
        ) {
          kind = 'reschedule';
        } else if (meet !== '' && (before.meet_url ?? '') !== meet) {
          kind = 'link';
        }
      }
    } else {
      const created = await prisma.liveClass.create({
        data: {
          ...data,
          created_by_type: actorRole,
          created_by: actorId > 0 ? actorId : null,
        },
        select: { id: true },
      });
      classId = created.id;
      message = 'lcl.msg.scheduled';
      kind = status === 'scheduled' ? 'new' : null;
    }
  } catch {
    return fail('lcl.err.save');
  }

  const notified = kind === null ? 0 : await notifyClass(classId, kind);
  return { ok: true, message, classId, notified };
}

/* ------------------------------------------------------- status changes */

export async function setClassStatus(
  classId: number,
  status: ClassStatus,
  lockTeacherId?: number
): Promise<ClassOutcome> {
  const loaded = await loadOwned(classId, lockTeacherId);
  if (loaded === 'forbidden') return fail('lcl.err.not_owner');
  if (loaded === null) return fail('lcl.err.not_found');

  // Cancelling something already cancelled says so rather than messaging the
  // batch a second time.
  if (status === 'cancelled' && loaded.status === 'cancelled') {
    return { ok: true, message: 'lcl.msg.already_cancelled', classId };
  }

  try {
    await prisma.liveClass.update({ where: { id: classId }, data: { status } });
  } catch {
    return fail('lcl.err.save');
  }

  if (status === 'cancelled') {
    const notified = await notifyClass(classId, 'cancel');
    return { ok: true, message: 'lcl.msg.cancelled', classId, notified };
  }
  if (status === 'scheduled') {
    // Students were told it was cancelled — tell them it is back on.
    const notified = loaded.status === 'cancelled' ? await notifyClass(classId, 'new') : 0;
    return { ok: true, message: 'lcl.msg.reopened', classId, notified };
  }
  return { ok: true, message: 'lcl.msg.completed', classId };
}

export async function deleteLiveClass(
  classId: number,
  lockTeacherId?: number
): Promise<ClassOutcome> {
  const loaded = await loadOwned(classId, lockTeacherId);
  if (loaded === 'forbidden') return fail('lcl.err.not_owner');
  if (loaded === null) return fail('lcl.err.not_found');

  let paths: string[] = [];
  try {
    const materials = await prisma.liveClassMaterial.findMany({
      where: { live_class_id: classId },
      select: { file_path: true },
    });
    paths = materials.map((material) => material.file_path);

    await prisma.$transaction([
      prisma.liveClassMaterial.deleteMany({ where: { live_class_id: classId } }),
      prisma.liveClass.delete({ where: { id: classId } }),
    ]);
  } catch {
    return fail('lcl.err.save');
  }

  // Files go only once the rows are gone, so a failed delete never leaves rows
  // pointing at missing files.
  for (const path of paths) await deleteFile(path);

  return { ok: true, message: 'lcl.msg.deleted' };
}

/* ------------------------------------------------------------ materials */

export async function addMaterial(
  classId: number,
  title: string,
  file: File | null,
  uploaderRole: 'teacher' | 'admin',
  uploaderId: number,
  lockTeacherId?: number
): Promise<ClassOutcome> {
  const loaded = await loadOwned(classId, lockTeacherId);
  if (loaded === 'forbidden') return fail('lcl.err.not_owner');
  if (loaded === null) return fail('lcl.err.not_found');

  const clean = title.trim();
  if (clean === '') return fail('lcl.err.material_title');
  if (clean.length > 255) {
    return fail('lcl.err.too_long', { field: 'common.title', max: 255 });
  }

  const check = await validateUpload(
    file,
    [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS],
    MATERIAL_MB * 1048576
  );
  if (!check.ok) {
    // Already in the visitor's language.
    return { ok: false, message: '', text: check.error };
  }

  // `validateUpload` has already read the file to check its magic number, so
  // reading it a second time would only risk a different result.
  const bytes = check.bytes ?? Buffer.alloc(0);
  const stored = await putFile(
    'uploads/live_classes',
    uniqueFilename(check.ext, 'lcm'),
    bytes,
    check.mime
  );
  if (stored === null) return fail('lcl.err.material_save');

  try {
    await prisma.liveClassMaterial.create({
      data: {
        live_class_id: classId,
        title: clean,
        file_path: stored,
        file_type: check.ext,
        file_size: bytes.length,
        uploaded_by_type: uploaderRole,
        uploaded_by: uploaderId > 0 ? uploaderId : null,
      },
    });
  } catch {
    // The row failed, so the file has no owner — remove it rather than leave it
    // on disk for ever.
    await deleteFile(stored);
    return fail('lcl.err.material_save');
  }

  // A cancelled class does not message its students about a new handout.
  const notified =
    loaded.status === 'cancelled' ? 0 : await notifyClass(classId, 'material', { title: clean });

  return { ok: true, message: 'lcl.msg.material_added', classId, notified };
}

export async function deleteMaterial(
  materialId: number,
  lockTeacherId?: number
): Promise<ClassOutcome> {
  if (!Number.isInteger(materialId) || materialId <= 0) {
    return fail('lcl.err.material_not_found');
  }

  let material;
  try {
    material = await prisma.liveClassMaterial.findUnique({
      where: { id: materialId },
      select: { id: true, file_path: true, live_class_id: true },
    });
  } catch {
    return fail('lcl.err.material_save');
  }
  if (!material) return fail('lcl.err.material_not_found');

  // The material is reachable only through a class this actor owns.
  const loaded = await loadOwned(material.live_class_id, lockTeacherId);
  if (loaded === 'forbidden') return fail('lcl.err.not_owner');
  if (loaded === null) return fail('lcl.err.not_found');

  try {
    await prisma.liveClassMaterial.delete({ where: { id: material.id } });
  } catch {
    return fail('lcl.err.material_save');
  }
  await deleteFile(material.file_path);

  return { ok: true, message: 'lcl.msg.material_deleted', classId: material.live_class_id };
}

/* -------------------------------------------------------- notifications */

export type NotifyKind = 'new' | 'link' | 'reschedule' | 'cancel' | 'material';

const NOTIFY_ICONS: Record<NotifyKind, string> = {
  new: 'camera-video',
  link: 'camera-video',
  reschedule: 'calendar-event',
  cancel: 'x-circle',
  material: 'file-earmark-arrow-down',
};

/**
 * The students who see this class on their Live Classes page —
 * orbit_live_class_audience().
 *
 * Candidates are narrowed by name first, then each one is checked against their
 * OWN scope, because whether a class is theirs depends on the course a batch
 * name belongs to for that student. Checking name equality alone would notify
 * another course's "Morning Batch".
 */
async function classAudience(row: {
  id: number;
  course: string | null;
  batch: string | null;
  branch_id: number | null;
}): Promise<number[]> {
  const course = (row.course ?? '').trim();
  const batch = (row.batch ?? '').trim();

  try {
    if (course === '' && batch === '') {
      // Open to everyone, exactly as the student page shows it.
      const all = await prisma.student.findMany({ orderBy: { id: 'asc' }, select: { id: true } });
      return all.map((student) => student.id);
    }

    const names = [...new Set([course, batch].filter((name) => name !== ''))];

    const candidates = await prisma.student.findMany({
      where: {
        OR: [
          { course: { in: names } },
          { batch: { in: names } },
          {
            enrollment_student: {
              some: {
                status: 'active',
                OR: [
                  { course_name: { in: names } },
                  { batch_name: { in: names } },
                  { course: { OR: [{ name: { in: names } }, { name_bn: { in: names } }] } },
                  { batch: { OR: [{ name: { in: names } }, { name_bn: { in: names } }] } },
                ],
              },
            },
          },
        ],
      },
      orderBy: { id: 'asc' },
      select: { id: true, course: true, batch: true, batch_id: true, branch_id: true },
    });

    // Every candidate's scope from one enrolment query, and the class checked
    // against each scope in memory. This used to be two queries PER candidate
    // (their enrolments, then a count of this one class under their scope) —
    // hundreds of round trips to notify a big course. `scopeMatches` answers
    // null for any condition it cannot evaluate exactly, and only then is the
    // database asked, as before.
    const scopes = await studentScopes(candidates);
    const classRow = { course: row.course, batch: row.batch, branch_id: row.branch_id };

    const ids: number[] = [];
    for (const student of candidates) {
      const scope = scopes.get(student.id);
      if (!scope) continue;
      const where = scopeOpenWhere(scope, 'batch', 'course');
      let visible = scopeMatches(classRow, where);
      if (visible === null) {
        visible =
          (await prisma.liveClass.count({ where: { AND: [{ id: row.id }, where] } })) > 0;
      }
      if (visible) ids.push(student.id);
    }
    return ids;
  } catch {
    return [];
  }
}

/** Each student's interface language: their saved choice, else the site default. */
async function studentLangs(ids: number[]): Promise<Map<number, Lang>> {
  const fallback = await setting('default_language', 'bn');
  const base: Lang = isLang(fallback) ? fallback : 'bn';

  const langs = new Map<number, Lang>(ids.map((id) => [id, base]));
  try {
    const rows = await prisma.userPreference.findMany({
      where: { user_type: 'student', user_id: { in: ids } },
      select: { user_id: true, lang: true },
    });
    for (const row of rows) {
      if (isLang(row.lang)) langs.set(row.user_id, row.lang);
    }
  } catch {
    // `lang` missing before the upgrade — the default applies.
  }
  return langs;
}

/**
 * Notifies the class's students, **each in their own language**.
 *
 * That is why this writes one row per student rather than one createMany with a
 * single title: the notification is stored as text, so the language has to be
 * chosen when it is written, not when it is read.
 */
export async function notifyClass(
  classId: number,
  kind: NotifyKind,
  extra: { title?: string } = {}
): Promise<number> {
  if (!(kind in NOTIFY_ICONS)) return 0;

  let row;
  try {
    row = await prisma.liveClass.findUnique({
      where: { id: classId },
      select: {
        id: true,
        subject: true,
        course: true,
        batch: true,
        branch_id: true,
        class_date: true,
        start_time: true,
      },
    });
  } catch {
    return 0;
  }
  if (!row) return 0;

  const ids = await classAudience(row);
  if (ids.length === 0) return 0;

  const langs = await studentLangs(ids);
  const byLang = new Map<Lang, number[]>();
  for (const id of ids) {
    const lang = langs.get(id) ?? 'bn';
    byLang.set(lang, [...(byLang.get(lang) ?? []), id]);
  }

  let sent = 0;
  for (const [lang, group] of byLang) {
    const vars = {
      subject: row.subject,
      title: extra.title ?? '',
      date: formatDate(row.class_date, 'd M Y', lang),
      // The TIME column carries its clock in UTC, so the start has to be rebuilt
      // on the class date before it is formatted — formatting the bare column
      // would shift every time by the server's offset.
      time: formatDate(new Date(startOf(row.class_date, row.start_time)), 'h:i A', lang),
    };
    const title = translate(lang, `lcl.notify.${kind}_title`, vars).slice(0, 255);
    const message = translate(lang, `lcl.notify.${kind}_body`, vars);

    try {
      const written = await prisma.notification.createMany({
        data: group.map((id) => ({
          user_type: 'student' as const,
          user_id: id,
          title,
          message,
          link: '/student/live-classes',
          icon: NOTIFY_ICONS[kind],
          is_read: false,
        })),
      });
      sent += written.count;
    } catch {
      // A missed notification must not fail the change that caused it.
    }
  }
  return sent;
}

/**
 * The outcome as a sentence in the reader's language.
 *
 * Everything above returns translation KEYS rather than text so that the library
 * stays usable from any language. This is where they become words — including
 * the "…, 12 students notified" the original appends, which is the only way a
 * teacher can tell that pressing save reached anybody.
 */
export function outcomeMessage(outcome: ClassOutcome, lang: Lang): string {
  if (outcome.text !== undefined && outcome.text !== '') return outcome.text;
  if (outcome.message === '') return '';

  // A var may itself be a key ('common.subject' for the too-long message) or a
  // number, which has to carry the reader's digits.
  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(outcome.vars ?? {})) {
    vars[name] =
      typeof value === 'number'
        ? toLocalDigits(value, lang)
        : hasTranslation(value)
          ? translate(lang, value)
          : value;
  }

  const text = translate(lang, outcome.message, vars);
  const notified = outcome.notified ?? 0;
  if (notified <= 0) return text;

  return `${text} ${translate(lang, 'lcl.msg.notified', { count: toLocalDigits(notified, lang) })}`;
}
