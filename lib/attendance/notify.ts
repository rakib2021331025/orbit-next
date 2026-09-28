import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { isDeliverable, sendMail, mailIsConfigured } from '@/lib/email/send';
import { emailLayout, emailParagraph } from '@/lib/email/layout';
import { settingLocalized, setting } from '@/lib/settings';
import { isLang, translate, type Lang } from '@/lib/i18n';
import { formatDate, pickLocalized } from '@/lib/i18n/format';
import { absoluteUrl } from '@/lib/site/url';

/**
 * Telling students they were marked absent, from admin/attendance.php.
 *
 * Only students who are **newly** absent are told: saving a register again to fix
 * one student's mark must not send yesterday's absentees a second message.
 *
 * Each student is written to in their own language, and the portal notification
 * is sent whether or not email is configured — the notification is the part the
 * student will definitely see.
 */

export interface NotifyResult {
  notified: number;
  emailFailed: number;
}

/**
 * Each student's own interface language, else the site default — for the
 * whole list in one query rather than one per absentee.
 */
async function studentLangs(studentIds: number[], fallback: Lang): Promise<Map<number, Lang>> {
  const langs = new Map<number, Lang>();
  try {
    const rows = await prisma.userPreference.findMany({
      where: { user_type: 'student', user_id: { in: studentIds } },
      orderBy: { id: 'asc' },
      select: { user_id: true, lang: true },
    });
    for (const row of rows) {
      // First row per student, as findFirst would have returned.
      if (!langs.has(row.user_id) && isLang(row.lang)) langs.set(row.user_id, row.lang);
    }
  } catch {
    // The default applies to everybody.
  }
  for (const id of studentIds) if (!langs.has(id)) langs.set(id, fallback);
  return langs;
}

export async function notifyAbsent(
  studentIds: number[],
  date: Date,
  className: string
): Promise<NotifyResult> {
  const result: NotifyResult = { notified: 0, emailFailed: 0 };
  if (studentIds.length === 0) return result;

  const students = await prisma.student
    .findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true, name_bn: true, email: true },
    })
    .catch(() => []);

  const configured = await setting('default_language', 'bn');
  const siteLang: Lang = isLang(configured) ? configured : 'bn';
  const mailOn = mailIsConfigured();
  const langs = await studentLangs(
    students.map((student) => student.id),
    siteLang
  );

  // Each student's text in their own language, worked out once.
  const messages = students.map((student) => {
    const lang = langs.get(student.id) ?? siteLang;
    const dateText = formatDate(date, 'd M Y', lang);
    const subject = className.trim() !== '' ? className : translate(lang, 'att.absent_class_default');
    return {
      student,
      lang,
      title: translate(lang, 'att.absent_title', { date: dateText }),
      body: translate(lang, 'att.absent_body', { class: subject, date: dateText }),
    };
  });

  // Every portal notification in one insert rather than one per absentee.
  try {
    const written = await prisma.notification.createMany({
      data: messages.map(({ student, title, body }) => ({
        user_type: 'student' as const,
        user_id: student.id,
        title,
        message: body,
        link: '/student/attendance',
        icon: 'calendar-x',
        is_read: false,
      })),
    });
    result.notified = written.count;
  } catch {
    // A failed notification is not worth failing the register over.
  }

  for (const { student, lang, title, body } of messages) {
    if (mailOn && isDeliverable(student.email)) {
      const name = pickLocalized(student, 'name', lang);
      const greeting = translate(lang, 'email.greeting', { name });
      const institute = await settingLocalized('institute_name', 'Orbit Private Care', lang);

      const sent = await sendMail({
        to: student.email,
        toName: name,
        subject: `${title} — ${institute}`,
        text: `${greeting}\n\n${body}`,
        html: await emailLayout(
          lang,
          title,
          emailParagraph(greeting) + emailParagraph(body),
          absoluteUrl('/student/attendance'),
          translate(lang, 'student.nav.attendance')
        ),
        template: 'attendance_absent',
        relatedType: 'attendance',
        studentId: student.id,
      });
      if (!sent.ok) result.emailFailed++;
    }
  }

  return result;
}
