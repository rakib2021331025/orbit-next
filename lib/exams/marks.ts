import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { isLang, translate, type Lang } from '@/lib/i18n';
import { formatNumber, monthLabel, pickLocalized, toLocalDigits } from '@/lib/i18n/format';
import { allSettings } from '@/lib/settings';
import { gradeForPercentage, toLatinDigits } from '@/lib/results/grades';
import { examResults, examRoster, monthlyExam, type StudentResult } from '@/lib/results/exam';
import { isDeliverable, sendMail } from '@/lib/email/send';
import { emailLayout, emailParagraph, emailRows, emailRowsText } from '@/lib/email/layout';
import { absoluteUrl } from '@/lib/site/url';
import { examSubjects } from './monthly';

/**
 * Marks entry and result publishing for one monthly exam, from
 * admin/monthly_exam_marks.php and the MARKS half of includes/result_lib.php.
 *
 * A mark is a number from 0 to the subject's full marks, **AB** for an absent
 * student, or empty for "not entered yet". Empty is not zero: a zero is a result
 * and an empty box is an unfinished sheet, and the difference decides whether a
 * student can be ranked.
 *
 * Only students on the roster and subjects of this exam are ever written, so a
 * tampered form cannot record marks against somebody else's exam.
 */

const ABSENT = ['AB', 'A', 'ABS', 'ABSENT'];

export interface MarkError {
  studentId: number;
  subject: string;
  value: string;
}

export interface MarksOutcome {
  saved: number;
  cleared: number;
  errors: MarkError[];
  failed: boolean;
}

export async function saveMarks(
  examId: number,
  grid: Map<number, Map<number, string>>,
  adminId: number
): Promise<MarksOutcome> {
  const exam = await monthlyExam(examId);
  if (!exam) return { saved: 0, cleared: 0, errors: [], failed: true };

  const subjects = new Map((await examSubjects(examId)).map((row) => [row.id, row]));
  const roster = await examRoster(exam);
  const onRoster = new Set(roster.map((student: { id: number }) => student.id));

  let saved = 0;
  let cleared = 0;
  const errors: MarkError[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const [studentId, row] of grid) {
        if (!onRoster.has(studentId)) continue;

        for (const [subjectId, raw] of row) {
          const subject = subjects.get(subjectId);
          if (!subject) continue;

          const full = Number(subject.full_marks);
          // Bangla digits are what a Bangla keyboard produces, and they mean
          // the same number.
          const value = toLatinDigits(raw).trim();

          if (value === '') {
            const removed = await tx.examResult.deleteMany({
              where: { exam_subject_id: subjectId, student_id: studentId },
            });
            cleared += removed.count;
            continue;
          }

          const absent = ABSENT.includes(value.toUpperCase());
          const number = Number(value);
          if (!absent && (!Number.isFinite(number) || number < 0 || number > full)) {
            errors.push({ studentId, subject: subject.subject_name, value });
            continue;
          }

          const obtained = absent ? 0 : Math.round(number * 100) / 100;
          const percentage = full > 0 ? (obtained / full) * 100 : 0;
          // An absence and a mark below the subject's own pass marks are both
          // an F, whatever the percentage band would say.
          const grade =
            absent || obtained < Number(subject.pass_marks)
              ? 'F'
              : gradeForPercentage(percentage).grade;

          const data = {
            exam_name: exam.title,
            subject: subject.subject_name,
            marks_obtained: obtained,
            total_marks: full,
            grade,
            exam_date: exam.exam_date,
            monthly_exam_id: exam.id,
            is_absent: absent,
            entered_by: adminId > 0 ? adminId : null,
          };

          await tx.examResult.upsert({
            where: { exam_subject_id_student_id: { exam_subject_id: subjectId, student_id: studentId } },
            create: { student_id: studentId, exam_subject_id: subjectId, ...data },
            update: data,
          });
          saved += 1;
        }
      }
    });
  } catch {
    return { saved: 0, cleared: 0, errors: [], failed: true };
  }

  return { saved, cleared, errors, failed: false };
}

/* ---------------------------------------------------------------- publish */

export interface PublishOutcome {
  ok: boolean;
  notified: number;
  emailed: number;
  failed: number;
}

/** The student's own language, so a result arrives in the one they read. */
/**
 * Each student's own language, else the site default — for the whole class in
 * one query, not one per student.
 */
async function studentLangs(studentIds: number[]): Promise<Map<number, Lang>> {
  const fallback = (await allSettings()).default_language ?? 'bn';
  const base: Lang = isLang(fallback) ? fallback : 'bn';
  const langs = new Map<number, Lang>(studentIds.map((id) => [id, base]));
  if (studentIds.length === 0) return langs;
  try {
    // (user_type, user_id) is unique, so there is at most one row each.
    const rows = await prisma.userPreference.findMany({
      where: { user_type: 'student', user_id: { in: studentIds } },
      select: { user_id: true, lang: true },
    });
    for (const row of rows) if (isLang(row.lang)) langs.set(row.user_id, row.lang);
  } catch {
    // Fall through to the site default.
  }
  return langs;
}

/** The result figures as an email table — the same rows the marksheet shows. */
function resultRows(result: StudentResult, lang: Lang): [string, string][] {
  const rows: [string, string][] = [
    [translate(lang, 'email.total'), formatNumber(result.totalFull, 0, lang)],
    [
      translate(lang, 'email.obtained'),
      formatNumber(result.totalObtained, 2, lang).replace(/[.।]?0+$/, ''),
    ],
    [translate(lang, 'email.percentage'), `${formatNumber(result.percentage, 2, lang)}%`],
    [translate(lang, 'email.gpa'), result.gpa === null ? '' : formatNumber(result.gpa, 2, lang)],
    [translate(lang, 'email.grade'), result.grade],
    [
      translate(lang, 'email.result'),
      translate(lang, result.passed ? 'status.passed' : 'status.failed'),
    ],
    [
      translate(lang, 'email.position'),
      result.hasPosition && result.position ? toLocalDigits(result.position, lang) : '',
    ],
  ];
  return rows.filter(([, value]) => value !== '');
}

/**
 * Publishing a result, and telling the students it is there.
 *
 * Notifications and emails are sent **after** the exam is marked published, so
 * a student who follows the link finds the result already visible rather than a
 * page that says it is not out yet.
 */
export async function publishExam(
  examId: number,
  options: { portal: boolean; email: boolean },
  adminId: number
): Promise<PublishOutcome> {
  const exam = await monthlyExam(examId);
  if (!exam) return { ok: false, notified: 0, emailed: 0, failed: 0 };

  try {
    await prisma.monthlyExam.update({
      where: { id: examId },
      data: { status: 'published', published_at: new Date() },
    });
  } catch {
    return { ok: false, notified: 0, emailed: 0, failed: 0 };
  }

  if (!options.portal && !options.email) {
    return { ok: true, notified: 0, emailed: 0, failed: 0 };
  }

  const computation = await examResults(examId);
  if (!computation) return { ok: true, notified: 0, emailed: 0, failed: 0 };

  let notified = 0;
  let emailed = 0;
  let failed = 0;

  // Nothing to announce to a student with no marks at all.
  const announced = [...computation.students].filter(([, result]) => result.hasMarks);
  const langs = await studentLangs(announced.map(([studentId]) => studentId));

  // Every portal notification, each in the student's own language, as ONE
  // insert rather than one per student.
  if (options.portal && announced.length > 0) {
    try {
      const written = await prisma.notification.createMany({
        data: announced.map(([studentId, result]) => {
          const lang = langs.get(studentId) ?? 'bn';
          const title = pickLocalized(exam, 'title', lang);
          const word =
            result.failedSubjects > 0
              ? translate(lang, 'result.fail')
              : translate(lang, result.complete ? 'result.pass' : 'result.incomplete');
          return {
            user_type: 'student' as const,
            user_id: studentId,
            title: translate(lang, 'mexam.result_notice_title', { exam: title }),
            message: translate(lang, 'mexam.result_notice_body', {
              exam: title,
              month: monthLabel(exam.exam_month, lang),
              gpa: result.gpa === null ? '—' : formatNumber(result.gpa, 2, lang),
              result: word,
            }),
            link: `/student/results?exam=${examId}`,
            icon: 'award',
            is_read: false,
          };
        }),
      });
      notified = written.count;
    } catch {
      // A notification that cannot be written must not stop the emails.
    }
  }

  for (const [studentId, result] of announced) {
    const lang = langs.get(studentId) ?? 'bn';
    const title = pickLocalized(exam, 'title', lang);

    if (options.email && isDeliverable(result.student.email)) {
      const examTitle = title;
      const month = monthLabel(exam.exam_month, lang);
      const rows = resultRows(result, lang);
      const greeting = translate(lang, 'email.greeting', { name: result.student.name });
      const intro = translate(lang, 'email.result_intro', { exam: examTitle, month });

      const sent = await sendMail({
        to: result.student.email,
        toName: pickLocalized(result.student, 'name', lang),
        subject: translate(lang, 'email.result_subject', {
          exam: examTitle,
          name: result.student.name,
        }),
        text: `${greeting}\n\n${intro}\n\n${emailRowsText(rows)}`,
        html: await emailLayout(
          lang,
          translate(lang, 'email.result_title'),
          emailParagraph(greeting) + emailParagraph(intro) + emailRows(rows),
          absoluteUrl('/student/results'),
          translate(lang, 'email.view_result')
        ),
        template: 'result_published',
        relatedType: 'monthly_exam',
        relatedId: examId,
        studentId,
        sentBy: adminId > 0 ? adminId : undefined,
      });

      if (sent.ok) emailed += 1;
      else failed += 1;
    }
  }

  return { ok: true, notified, emailed, failed };
}

export async function unpublishExam(examId: number): Promise<boolean> {
  try {
    await prisma.monthlyExam.update({
      where: { id: examId },
      data: { status: 'draft', published_at: null },
    });
    return true;
  } catch {
    return false;
  }
}
