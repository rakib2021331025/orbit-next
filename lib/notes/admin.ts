import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { isLang, translate, type Lang } from '@/lib/i18n';
import { pickLocalized } from '@/lib/i18n/format';
import { allSettings } from '@/lib/settings';
import { getFile } from '@/lib/storage/store';
import { isDeliverable, sendMail } from '@/lib/email/send';
import { emailLayout, emailParagraph, emailRows, emailRowsText } from '@/lib/email/layout';
import { absoluteUrl } from '@/lib/site/url';

/**
 * PDF class notes and the emails that deliver them, from
 * admin/note_management.php.
 *
 * A note is tagged with **one course or batch NAME**, not an id, and students
 * see it when any of their own names match — their course, their batch, or the
 * course/batch of an active enrolment. That is the same scoping the student
 * portal uses, and matching on ids instead would hide notes from every student
 * admitted before enrolments existed.
 *
 * Sending is **resumable by design**: a student who already received a note is
 * skipped, so pressing Send again reaches only the new students rather than
 * mailing everybody twice.
 */

export interface GroupOption {
  value: string;
  label: string;
  /** How many approved students that name reaches. */
  recipients: number;
}

export interface GroupOptions {
  /** Courses, each with "all batches" plus its own batches. */
  groups: { label: string; items: GroupOption[] }[];
  /** Names still in use on students or old notes that are not courses or batches. */
  other: GroupOption[];
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/**
 * Approved students per lower-cased course/batch name.
 *
 * Every name a student can be reached by counts: their own two columns, the
 * enrolment's stored names, and the linked course's and batch's names in both
 * languages.
 */
export async function recipientCounts(): Promise<Map<string, number>> {
  const students = await safe(
    () =>
      prisma.student.findMany({
        where: { status: 'approved' },
        select: {
          id: true,
          course: true,
          batch: true,
          enrollment_student: {
            where: { status: 'active' },
            select: {
              course_name: true,
              batch_name: true,
              course: { select: { name: true, name_bn: true } },
              batch: { select: { name: true, name_bn: true } },
            },
          },
        },
      }),
    []
  );

  const byName = new Map<string, Set<number>>();
  const add = (value: string | null | undefined, id: number) => {
    const name = (value ?? '').trim().toLowerCase();
    if (name === '') return;
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name)!.add(id);
  };

  for (const student of students) {
    add(student.course, student.id);
    add(student.batch, student.id);
    for (const enrolment of student.enrollment_student) {
      add(enrolment.course_name, student.id);
      add(enrolment.batch_name, student.id);
      add(enrolment.course?.name, student.id);
      add(enrolment.course?.name_bn, student.id);
      add(enrolment.batch?.name, student.id);
      add(enrolment.batch?.name_bn, student.id);
    }
  }

  return new Map([...byName].map(([name, ids]) => [name, ids.size]));
}

/** Every name a note may be tagged with, grouped by course. */
export async function groupOptions(lang: Lang): Promise<GroupOptions> {
  const [courses, batches, counts] = await Promise.all([
    safe(
      () =>
        prisma.course.findMany({
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
          select: { name: true, name_bn: true },
        }),
      []
    ),
    safe(
      () =>
        prisma.batch.findMany({
          where: { NOT: { course_id: null } },
          orderBy: [{ course_id: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
          select: {
            name: true,
            name_bn: true,
            batch_type: true,
            course: { select: { name: true } },
          },
        }),
      []
    ),
    recipientCounts(),
  ]);

  const reach = (value: string) => counts.get(value.trim().toLowerCase()) ?? 0;
  const known = new Set<string>();
  const groups = new Map<string, { label: string; items: GroupOption[] }>();

  for (const course of courses) {
    const name = course.name.trim();
    if (name === '' || groups.has(name)) continue;

    const label = pickLocalized(course, 'name', lang);
    groups.set(name, {
      label,
      items: [
        {
          value: name,
          label: translate(lang, 'anote.whole_course', { course: label }),
          recipients: reach(name),
        },
      ],
    });
    known.add(name.toLowerCase());
  }

  for (const batch of batches) {
    const course = (batch.course?.name ?? '').trim();
    const name = batch.name.trim();
    const group = groups.get(course);
    if (name === '' || !group || group.items.some((item) => item.value === name)) continue;

    group.items.push({
      value: name,
      label: `${pickLocalized(batch, 'name', lang)} · ${translate(lang, `course.type_${batch.batch_type}`)}`,
      recipients: reach(name),
    });
    known.add(name.toLowerCase());
  }

  // Names that exist only on students or on older notes still have to be
  // taggable, or an old note could not be edited without changing its audience.
  const [noteNames, studentNames] = await Promise.all([
    safe(
      () => prisma.adminNote.findMany({ distinct: ['batch'], select: { batch: true } }),
      []
    ),
    safe(
      () =>
        prisma.student.findMany({
          distinct: ['course', 'batch'],
          select: { course: true, batch: true },
        }),
      []
    ),
  ]);

  const other = new Map<string, string>();
  for (const value of [
    ...noteNames.map((row) => row.batch),
    ...studentNames.flatMap((row) => [row.course, row.batch]),
  ]) {
    const name = (value ?? '').trim();
    if (name === '' || known.has(name.toLowerCase())) continue;
    other.set(name.toLowerCase(), name);
  }

  return {
    groups: [...groups.values()],
    other: [...other.values()]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name, recipients: reach(name) })),
  };
}

/** True when a name is one of the offered options. */
export function groupAllowed(options: GroupOptions, value: string): boolean {
  if (value === '' || value.length > 100) return false;
  return (
    options.groups.some((group) => group.items.some((item) => item.value === value)) ||
    options.other.some((item) => item.value === value)
  );
}

/* ------------------------------------------------------------------ list */

export async function noteList(take: number, skip: number) {
  const notes = await safe(
    () =>
      prisma.adminNote.findMany({
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take,
        skip,
      }),
    []
  );

  // admin_notes.created_by is a plain column, and the sent count is a distinct
  // count — both are separate reads rather than an include.
  const [admins, sent] = await Promise.all([
    safe(
      () =>
        prisma.admin.findMany({
          where: { id: { in: notes.map((note) => note.created_by) } },
          select: { id: true, email: true },
        }),
      []
    ),
    safe(
      () =>
        prisma.noteEmailLog.groupBy({
          by: ['note_id', 'student_id'],
          where: { note_id: { in: notes.map((note) => note.id) }, status: 'sent' },
        }),
      [] as { note_id: number; student_id: number }[]
    ),
  ]);

  const adminById = new Map(admins.map((admin) => [admin.id, admin.email]));
  const sentCount = new Map<number, number>();
  for (const row of sent) {
    sentCount.set(row.note_id, (sentCount.get(row.note_id) ?? 0) + 1);
  }

  return notes.map((note) => ({
    ...note,
    adminEmail: adminById.get(note.created_by) ?? '',
    sentCount: sentCount.get(note.id) ?? 0,
  }));
}

/** The latest sending attempts, for the history panel. */
export async function noteHistory(limit = 50) {
  const logs = await safe(
    () =>
      prisma.noteEmailLog.findMany({
        orderBy: [{ sent_at: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
    []
  );

  const [students, notes] = await Promise.all([
    safe(
      () =>
        prisma.student.findMany({
          where: { id: { in: logs.map((log) => log.student_id) } },
          select: { id: true, name: true },
        }),
      []
    ),
    safe(
      () =>
        prisma.adminNote.findMany({
          where: { id: { in: logs.map((log) => log.note_id) } },
          select: { id: true, title: true },
        }),
      []
    ),
  ]);

  const studentById = new Map(students.map((student) => [student.id, student.name]));
  const noteById = new Map(notes.map((note) => [note.id, note.title]));

  return logs.map((log) => ({
    ...log,
    studentName: studentById.get(log.student_id) ?? '',
    noteTitle: noteById.get(log.note_id) ?? '',
  }));
}

/* ------------------------------------------------------------------ send */

export interface SendOutcome {
  ok: boolean;
  /** A translation key when something stopped the send before it began. */
  error: string;
  sent: number;
  failed: number;
  skipped: number;
  title: string;
  group: string;
}

/** A file name the recipient will recognise, with the punctuation stripped. */
function attachmentName(title: string): string {
  const clean = title.replace(/[^\p{L}\p{M}\p{N} _.-]+/gu, '').trim();
  return `${clean !== '' ? clean.slice(0, 80) : 'note'}.pdf`;
}

async function studentLang(studentId: number): Promise<Lang> {
  const fallback = (await allSettings()).default_language ?? 'bn';
  try {
    const row = await prisma.userPreference.findFirst({
      where: { user_type: 'student', user_id: studentId },
      select: { lang: true },
    });
    if (isLang(row?.lang)) return row.lang;
  } catch {
    // Fall through to the site default.
  }
  return isLang(fallback) ? fallback : 'bn';
}

/** The approved students of a name who have not had this note yet. */
export async function noteRecipients(noteId: number, group: string) {
  const [students, already] = await Promise.all([
    safe(
      () =>
        prisma.student.findMany({
          where: {
            status: 'approved',
            OR: [
              { course: group },
              { batch: group },
              {
                enrollment_student: {
                  some: {
                    status: 'active',
                    OR: [
                      { course_name: group },
                      { batch_name: group },
                      { course: { OR: [{ name: group }, { name_bn: group }] } },
                      { batch: { OR: [{ name: group }, { name_bn: group }] } },
                    ],
                  },
                },
              },
            ],
          },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, email: true },
        }),
      []
    ),
    safe(
      () =>
        prisma.noteEmailLog.findMany({
          where: { note_id: noteId, status: 'sent' },
          select: { student_id: true },
        }),
      []
    ),
  ]);

  const done = new Set(already.map((row) => row.student_id));
  return students.filter((student) => !done.has(student.id));
}

/** The note email, in the recipient's language, with the PDF attached. */
async function noteMail(
  note: { title: string; message: string | null },
  group: string,
  studentName: string,
  lang: Lang
) {
  const rows: [string, string][] = [
    [translate(lang, 'anote.email_note'), note.title],
    [translate(lang, 'anote.email_group'), group],
  ];
  const message = (note.message ?? '').trim();
  const greeting = translate(lang, 'email.greeting', { name: studentName });
  const intro = translate(lang, 'anote.email_intro');

  const body =
    emailParagraph(greeting) +
    emailParagraph(intro) +
    emailRows(rows) +
    (message !== ''
      ? emailParagraph(translate(lang, 'anote.email_message'), 'font-weight:700;color:#062c19;margin-bottom:4px') +
        emailParagraph(message)
      : '') +
    emailParagraph(translate(lang, 'anote.email_attached'), 'font-size:13px;color:#5b6961');

  return {
    subject: translate(lang, 'anote.email_subject', { title: note.title }),
    html: await emailLayout(
      lang,
      translate(lang, 'anote.email_title'),
      body,
      absoluteUrl('/student/materials#notes'),
      translate(lang, 'anote.email_cta')
    ),
    text:
      `${greeting}\n\n${intro}\n\n${emailRowsText(rows)}` +
      (message !== '' ? `\n${message}\n` : '') +
      `\n${translate(lang, 'anote.email_attached')}`,
  };
}

export async function sendNote(
  noteId: number,
  group: string,
  adminId: number
): Promise<SendOutcome> {
  const empty = { ok: false, sent: 0, failed: 0, skipped: 0, title: '', group };

  const note = await safe(() => prisma.adminNote.findUnique({ where: { id: noteId } }), null);
  if (!note) return { ...empty, error: 'anote.err_send_choose' };

  // The PDF is the whole email; a missing file must stop the send rather than
  // deliver an empty message to a class.
  const pdf = await getFile(note.pdf_path);
  if (!pdf) return { ...empty, error: 'anote.err_pdf_missing', title: note.title };

  const recipients = await noteRecipients(noteId, group);
  if (recipients.length === 0) {
    return { ...empty, error: 'anote.nobody_to_send', title: note.title };
  }

  const filename = attachmentName(note.title);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const student of recipients) {
    if (!isDeliverable(student.email)) {
      skipped += 1;
      continue;
    }

    const lang = await studentLang(student.id);
    const mail = await noteMail(note, group, student.name, lang);
    const result = await sendMail({
      to: student.email,
      toName: student.name,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: [{ filename, content: pdf }],
      template: 'class_note',
      relatedType: 'admin_note',
      relatedId: noteId,
      studentId: student.id,
      sentBy: adminId > 0 ? adminId : undefined,
    });

    // The note's own log is what makes a second Send skip this student, so it
    // is written whether the email worked or not.
    try {
      await prisma.noteEmailLog.create({
        data: {
          note_id: noteId,
          student_id: student.id,
          student_email: student.email,
          status: result.ok ? 'sent' : 'failed',
          error_message: result.ok ? null : result.error,
        },
      });
    } catch {
      // A failed log entry must not stop the rest of the send.
    }

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { ok: true, error: '', sent, failed, skipped, title: note.title, group };
}
