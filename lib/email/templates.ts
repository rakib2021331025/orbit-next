import 'server-only';
import { allSettings, settingLocalized } from '@/lib/settings';
import { translate, type Lang } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { formatPhone, absoluteUrl } from '@/lib/site/url';
import { emailLayout, emailParagraph, emailRows, emailRowsText, type EmailRows } from './layout';

/**
 * The transactional email bodies, from includes/mailer.php.
 *
 * Each one is written **in the recipient's language**, not the admin's: an
 * applicant who filled the form in Bangla gets a Bangla email even when an
 * English-speaking admin approves it. That is why `lang` is a parameter of every
 * template rather than read from the request.
 */

export interface MailBody {
  subject: string;
  html: string;
  text: string;
}

/** "Online batch — Morning" as the applicant chose it. */
function batchLabel(admission: { batch_label?: string | null; batch_type?: string | null }, lang: Lang): string {
  const label = (admission.batch_label ?? '').trim();
  const type = admission.batch_type
    ? translate(lang, admission.batch_type === 'online' ? 'course.type_online' : 'course.type_offline')
    : '';
  return [label, type].filter((part) => part !== '').join(' · ');
}

/**
 * "Your enrollment is approved" — with the Student ID, the username, and a
 * one-time link to choose a password.
 *
 * When the student already had a login, no link is sent and the mail says so:
 * offering a password setup link to someone who has been signing in for a year
 * invites them to reset a password they never lost.
 */
export async function enrollmentApprovedMail(
  admission: {
    course: string;
    batch_label?: string | null;
    batch_type?: string | null;
  },
  student: { name: string; student_id_no: string | null },
  login: { username: string; created: boolean },
  setupUrl: string,
  setupHours: number,
  lang: Lang
): Promise<MailBody> {
  const institute = await settingLocalized('institute_name', 'Orbit Private Care', lang);

  const rows: EmailRows = [
    [translate(lang, 'email.student_id'), student.student_id_no ?? ''],
    [translate(lang, 'email.course'), admission.course],
    [translate(lang, 'email.batch'), batchLabel(admission, lang)],
    [translate(lang, 'email.username'), login.username],
  ];

  const title = translate(lang, 'email.approved_title');
  let body =
    emailParagraph(translate(lang, 'email.greeting', { name: student.name })) +
    emailParagraph(translate(lang, 'email.approved_intro', { institute })) +
    emailRows(rows);

  let ctaUrl: string;
  let ctaLabel: string;

  if (setupUrl !== '') {
    body += emailParagraph(
      translate(lang, 'email.set_password_note', { hours: toLocalDigits(setupHours, lang) })
    );
    ctaUrl = setupUrl;
    ctaLabel = translate(lang, 'email.set_password');
  } else {
    body += emailParagraph(translate(lang, 'email.existing_login'));
    ctaUrl = absoluteUrl('/student/login');
    ctaLabel = translate(lang, 'email.dashboard');
  }

  return {
    subject: translate(lang, 'email.approved_subject', { institute }),
    html: await emailLayout(lang, title, body, ctaUrl, ctaLabel),
    text:
      `${translate(lang, 'email.greeting', { name: student.name })}\n\n` +
      `${translate(lang, 'email.approved_intro', { institute })}\n\n` +
      `${emailRowsText(rows)}\n${ctaLabel}: ${ctaUrl}\n`,
  };
}

/** "Application not approved" — with the admin's reason, which is always shown. */
export async function enrollmentRejectedMail(
  admission: { application_no: string | null; fullname: string; course: string },
  reason: string,
  paymentProblem: boolean,
  lang: Lang
): Promise<MailBody> {
  const settings = await allSettings();
  const phone = settings.helpline_number || settings.contact_phone || '';

  const rows: EmailRows = [
    [translate(lang, 'email.app_no'), admission.application_no ?? ''],
    [translate(lang, 'email.course'), admission.course],
    [translate(lang, 'email.reason'), reason],
  ];

  const title = translate(lang, 'email.rejected_title');
  const body =
    emailParagraph(translate(lang, 'email.greeting', { name: admission.fullname })) +
    emailParagraph(translate(lang, 'email.rejected_intro', { course: admission.course })) +
    // Only said when the payment itself could not be verified, so the applicant
    // knows to check their transaction rather than their qualifications.
    (paymentProblem ? emailParagraph(translate(lang, 'email.rejected_payment')) : '') +
    emailRows(rows) +
    emailParagraph(
      translate(lang, 'email.rejected_next', {
        phone: phone !== '' ? ` (${formatPhone(phone)})` : '',
      })
    );

  return {
    subject: translate(lang, 'email.rejected_subject', { app_no: admission.application_no ?? '' }),
    html: await emailLayout(lang, title, body),
    text:
      `${translate(lang, 'email.greeting', { name: admission.fullname })}\n\n` +
      `${translate(lang, 'email.rejected_intro', { course: admission.course })}\n\n` +
      emailRowsText(rows),
  };
}
