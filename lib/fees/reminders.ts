import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { isDeliverable, sendMail } from '@/lib/email/send';
import { emailLayout, emailParagraph, emailRows, emailRowsText, type EmailRows } from '@/lib/email/layout';
import { allSettings, settingLocalized } from '@/lib/settings';
import { isLang, translate, type Lang } from '@/lib/i18n';
import { formatMoney, formatDate, toLocalDigits } from '@/lib/i18n/format';
import { absoluteUrl } from '@/lib/site/url';
import { feeGapDays, feeLabel, rowDue } from './core';

/**
 * Fee reminders, from the REMINDERS half of includes/fee_lib.php.
 *
 * Sent in **small batches** by the caller, because a hundred emails in one
 * request is how a free host's 60-second limit gets hit and a send ends up half
 * done with nobody knowing which half.
 *
 * Three reasons to skip, all of them recorded so the history shows what happened:
 * nothing is due any more, no deliverable address, or the student was reminded
 * within the institute's gap. `force` overrides only the last one — there is no
 * point emailing somebody who owes nothing.
 */

export type ReminderStatus = 'sent' | 'failed' | 'skipped';

export interface ReminderResult {
  studentId: number;
  name: string;
  status: ReminderStatus;
  /** A reason code: no_due | no_email | recent | not_found | send_failed. */
  reason: string;
  /** Already translated, ready to show. */
  message: string;
}

async function logReminder(
  studentId: number,
  channel: 'email' | 'whatsapp',
  recipient: string,
  due: number,
  status: ReminderStatus,
  error: string,
  adminId: number
): Promise<void> {
  try {
    await prisma.feeReminder.create({
      data: {
        student_id: studentId,
        channel,
        recipient: recipient !== '' ? recipient.slice(0, 255) : null,
        due_amount: Math.round(due * 100) / 100,
        status,
        error: error !== '' ? error.slice(0, 255) : null,
        sent_by: adminId > 0 ? adminId : null,
      },
    });
  } catch {
    // The history is useful, not essential; a failed log must not stop a send.
  }
}

/** The student's own language, so a reminder arrives in the one they read. */
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

/** The reminder email: what is owed, item by item, and how to pay. */
async function reminderMail(
  student: { name: string; student_id_no: string | null },
  items: { label: string; amount: number; dueDate: Date | null }[],
  total: number,
  lang: Lang
) {
  const institute = await settingLocalized('institute_name', 'Orbit Private Care', lang);
  const settings = await allSettings();

  const rows: EmailRows = items.map((item) => [
    item.dueDate
      ? `${item.label} — ${translate(lang, 'fees.due_by', { date: formatDate(item.dueDate, 'd M Y', lang) })}`
      : item.label,
    formatMoney(item.amount, lang),
  ]);
  rows.push([translate(lang, 'fees.total_due'), formatMoney(total, lang)]);

  const methods = [settings.bkash_number, settings.nagad_number]
    .filter((value) => (value ?? '').trim() !== '')
    .join(', ');

  const title = translate(lang, 'fees.mail_title');
  const body =
    emailParagraph(translate(lang, 'email.greeting', { name: student.name })) +
    emailParagraph(
      translate(lang, 'fees.mail_intro', {
        total: formatMoney(total, lang),
        name: student.name,
        id: student.student_id_no ?? '',
      })
    ) +
    emailRows(rows) +
    (methods !== '' ? emailParagraph(translate(lang, 'fees.wa_pay', { methods })) : '') +
    emailParagraph(translate(lang, 'fees.mail_slip_note')) +
    // Somebody who has already paid must not be made to worry.
    emailParagraph(translate(lang, 'fees.mail_ignore'));

  return {
    subject: translate(lang, 'fees.mail_subject', {
      total: formatMoney(total, lang),
      institute,
    }),
    html: await emailLayout(
      lang,
      title,
      body,
      absoluteUrl('/student/payments'),
      translate(lang, 'fees.mail_cta')
    ),
    text:
      `${translate(lang, 'email.greeting', { name: student.name })}\n\n` +
      `${translate(lang, 'fees.mail_intro', {
        total: formatMoney(total, lang),
        name: student.name,
        id: student.student_id_no ?? '',
      })}\n\n${emailRowsText(rows)}`,
  };
}

export async function sendReminder(
  studentId: number,
  force: boolean,
  adminId: number
): Promise<ReminderResult> {
  const student = await prisma.student
    .findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, student_id_no: true },
    })
    .catch(() => null);

  if (!student) {
    const lang = await studentLang(studentId);
    return {
      studentId,
      name: '',
      status: 'skipped',
      reason: 'not_found',
      message: translate(lang, 'fees.skip_not_found'),
    };
  }

  const lang = await studentLang(student.id);

  const charges = await prisma.payment
    .findMany({ where: { student_id: student.id } })
    .catch(() => []);
  const plans = await prisma.installmentPlan
    .findMany({ where: { student_id: student.id }, select: { id: true, title: true, installments: true } })
    .catch(() => []);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const items = charges
    .filter((charge) => rowDue(charge) > 0)
    .map((charge) => ({
      label: feeLabel(
        {
          ...charge,
          plan_title: charge.installment_plan_id
            ? (planById.get(charge.installment_plan_id)?.title ?? null)
            : null,
          plan_installments: charge.installment_plan_id
            ? (planById.get(charge.installment_plan_id)?.installments ?? null)
            : null,
        },
        lang
      ),
      amount: rowDue(charge),
      dueDate: charge.due_date,
    }));
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  const email = student.email.trim();
  let reason = '';

  if (total <= 0) reason = 'no_due';
  else if (!isDeliverable(email)) reason = 'no_email';
  else if (!force) {
    const gap = await feeGapDays();
    if (gap > 0) {
      const since = new Date(Date.now() - gap * 24 * 60 * 60 * 1000);
      const recent = await prisma.feeReminder
        .count({
          where: {
            student_id: student.id,
            channel: 'email',
            status: 'sent',
            created_at: { gte: since },
          },
        })
        .catch(() => 0);
      if (recent > 0) reason = 'recent';
    }
  }

  if (reason !== '') {
    await logReminder(student.id, 'email', email, total, 'skipped', reason, adminId);
    return {
      studentId: student.id,
      name: student.name,
      status: 'skipped',
      reason,
      message: translate(lang, `fees.skip_${reason}`),
    };
  }

  const mail = await reminderMail(student, items, total, lang);
  const sent = await sendMail({
    to: email,
    toName: student.name,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    template: 'fee_reminder',
    relatedType: 'fee_reminder',
    studentId: student.id,
    sentBy: adminId > 0 ? adminId : undefined,
  });

  await logReminder(
    student.id,
    'email',
    email,
    total,
    sent.ok ? 'sent' : 'failed',
    sent.ok ? '' : sent.error,
    adminId
  );

  return {
    studentId: student.id,
    name: student.name,
    status: sent.ok ? 'sent' : 'failed',
    reason: sent.ok ? '' : 'send_failed',
    message: sent.ok ? translate(lang, 'fees.sent_to', { email }) : sent.error,
  };
}

/** Records that a WhatsApp reminder was handed over, for the same history. */
export async function logWhatsapp(
  studentId: number,
  who: 'student' | 'guardian',
  adminId: number
): Promise<boolean> {
  const student = await prisma.student
    .findUnique({ where: { id: studentId }, select: { id: true, phone: true, guardian_phone: true } })
    .catch(() => null);
  if (!student) return false;

  const charges = await prisma.payment
    .findMany({
      where: { student_id: studentId },
      // Only what rowDue reads.
      select: { payment_status: true, amount: true, due_amount: true },
    })
    .catch(() => []);
  const due = charges.reduce((sum, charge) => sum + rowDue(charge), 0);

  await logReminder(
    studentId,
    'whatsapp',
    who === 'guardian' ? (student.guardian_phone ?? '') : student.phone,
    due,
    'sent',
    '',
    adminId
  );
  return true;
}

export { toLocalDigits };
