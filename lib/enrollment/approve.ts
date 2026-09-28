import 'server-only';
import { randomInt, randomBytes, createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { ensureStudentId } from '@/lib/students/id';
import { mainBranchId } from '@/lib/branch/assign';
import { isDeliverable, sendMail } from '@/lib/email/send';
import { enrollmentApprovedMail, enrollmentRejectedMail } from '@/lib/email/templates';
import { setting } from '@/lib/settings';
import { isLang, translate, type Lang } from '@/lib/i18n';
import { absoluteUrl } from '@/lib/site/url';

/**
 * Approving and rejecting an enrollment application, from
 * includes/enrollment_lib.php.
 *
 * **Verification is always manual.** What an applicant submits is a *claim*:
 * method, transaction id, sender number, amount and a screenshot. Staff compare
 * it with the bKash/Nagad statement and then approve or reject. Nothing in this
 * file verifies a payment automatically, and it must stay that way.
 *
 * Approval is one transaction that does five things: the student record (linked
 * or created), the enrolment, the verified payment, the application's own status,
 * and the portal login. Either all of it happens or none of it does — a student
 * with an enrolment but no login, or a payment recorded against no enrolment, is
 * a mess someone has to unpick by hand.
 *
 * The notification and the email are sent *after* the commit, deliberately: a
 * mail server that hangs must not hold a database transaction open, and a bounced
 * email must not roll back an approval that has already been made.
 */

/** Used when an applicant gave no usable address; `students.email` is NOT NULL. */
export const NO_EMAIL = 'noemail@example.com';

const SETUP_HOURS = 72;

export interface ApproveResult {
  ok: boolean;
  /** A translated message, already in the admin's language. */
  error: string;
  student: { id: number; name: string; student_id_no: string | null; email: string; phone: string } | null;
  enrollmentId: number;
  login: { created: boolean; username: string; password: string | null; loginId: number } | null;
  /** True when the application was attached to a student who already existed. */
  linkedExisting: boolean;
  email: { sent: boolean; error: string };
}

/** Digits only, so 01712-345678 and 01712345678 compare equal. */
export function phoneDigits(phone: unknown): string {
  let digits = String(phone ?? '').replace(/\D+/g, '');
  if (digits.length === 13 && digits.startsWith('88')) digits = digits.slice(2);
  return digits;
}

/**
 * A readable temporary password: no 0/O/1/l/I, always at least one letter and
 * one digit.
 *
 * It gets read down a phone line to a student, which is the entire reason the
 * ambiguous characters are excluded.
 */
export function generateTempPassword(length = 10): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;

  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  for (let i = 2; i < length; i++) chars.push(all[randomInt(all.length)]);

  // Fisher–Yates with a CSPRNG, so the guaranteed letter and digit are not
  // always in the first two positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * The existing student an application belongs to, or null.
 *
 * **A typed Student ID alone is never enough** — it must come with the same
 * mobile number or email. Otherwise anybody could attach their enrolment to
 * another student's account by guessing an ID, and then see that student's
 * results in the portal.
 */
async function findStudentForAdmission(admission: {
  applicant_student_id: number | null;
  student_id_input: string | null;
  mobile: string;
  email: string | null;
}) {
  if (admission.applicant_student_id) {
    const row = await prisma.student.findUnique({ where: { id: admission.applicant_student_id } });
    if (row) return row;
  }

  const mobile = phoneDigits(admission.mobile);

  if (admission.student_id_input && admission.student_id_input.trim() !== '') {
    const row = await prisma.student.findFirst({
      where: { student_id_no: admission.student_id_input.trim().toUpperCase() },
    });
    if (row) {
      const samePhone = mobile !== '' && phoneDigits(row.phone) === mobile;
      const sameEmail =
        (admission.email ?? '').trim() !== '' &&
        row.email.trim().toLowerCase() === (admission.email ?? '').trim().toLowerCase();
      if (samePhone || sameEmail) return row;
    }
  }

  if (mobile !== '') {
    const row = await prisma.student.findFirst({
      where: { OR: [{ phone: mobile }, { phone: admission.mobile }] },
    });
    if (row) return row;
  }

  return null;
}

/**
 * Makes sure the student can sign in. The username is their Student ID.
 *
 * An existing login is left exactly as it is — password included — and reported
 * as `created: false`, so re-approving something never resets a password a
 * student is already using.
 */
async function ensureStudentLogin(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  student: { id: number; student_id_no: string | null }
): Promise<{ created: boolean; username: string; password: string | null; loginId: number }> {
  const existing = await tx.studentLogin.findFirst({
    where: { student_id: student.id },
    select: { id: true, username: true },
  });
  if (existing) {
    return { created: false, username: existing.username, password: null, loginId: existing.id };
  }

  const base = student.student_id_no && student.student_id_no !== '' ? student.student_id_no : `STU${student.id}`;
  let username = base;
  for (let n = 2; n < 50; n++) {
    const taken = await tx.studentLogin.findFirst({ where: { username }, select: { id: true } });
    if (!taken) break;
    username = `${base}-${n}`;
  }

  const password = generateTempPassword();
  const created = await tx.studentLogin.create({
    data: {
      student_id: student.id,
      username,
      password: await hashPassword(password),
      // The temporary password is known to whoever approved the application, so
      // the student must replace it before they can use the portal.
      must_change_password: true,
    },
    select: { id: true },
  });

  return { created: true, username, password, loginId: created.id };
}

/**
 * A one-time "choose your password" link, valid for 72 hours.
 *
 * The forgot-password link lasts 60 minutes, which is right for a link someone
 * asked for a minute ago and wrong for a welcome email that may not be opened
 * the same day. It uses the same `password_resets` table and the same reset page,
 * so no second mechanism exists to keep secure.
 */
async function passwordSetupUrl(
  student: { email: string },
  loginId: number,
  hours = SETUP_HOURS
): Promise<string> {
  if (!isDeliverable(student.email)) return '';

  try {
    const token = randomBytes(32).toString('hex');
    await prisma.passwordReset.create({
      data: {
        user_type: 'student',
        user_id: loginId,
        email: student.email,
        token_hash: createHash('sha256').update(token).digest('hex'),
        expires_at: new Date(Date.now() + hours * 3600 * 1000),
      },
    });
    return absoluteUrl(`/reset-password?token=${token}`);
  } catch {
    return '';
  }
}

export async function approveAdmission(
  admissionId: number,
  adminId: number,
  note: string,
  lang: Lang,
  options: { sendEmail?: boolean } = {}
): Promise<ApproveResult> {
  const result: ApproveResult = {
    ok: false,
    error: '',
    student: null,
    enrollmentId: 0,
    login: null,
    linkedExisting: false,
    email: { sent: false, error: '' },
  };
  const reviewNote = note.trim();

  let courseName = '';
  let batchName: string | null = null;
  let batchType: string | null = null;
  let admissionRow: Awaited<ReturnType<typeof prisma.admission.findUnique>> = null;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const admission = await tx.admission.findUnique({ where: { id: admissionId } });
      if (!admission) throw new Error('enroll.err_not_found');
      if (admission.status === 'approved' || admission.enrollment_id) {
        throw new Error('enroll.err_already_approved');
      }
      admissionRow = admission;

      const batch = admission.batch_id
        ? await tx.batch.findUnique({ where: { id: admission.batch_id } })
        : null;
      const courseId = batch?.course_id ?? admission.course_id ?? 0;
      const course = courseId > 0 ? await tx.course.findUnique({ where: { id: courseId } }) : null;

      courseName = admission.course !== '' ? admission.course : (course?.name ?? '');
      batchName = batch?.name ?? (admission.batch_label ?? null);
      batchType = batch?.batch_type ?? (admission.batch_type ?? null);

      // The batch's own fee wins; the course fee is the fallback.
      const fee =
        batch?.fee !== null && batch?.fee !== undefined
          ? Number(batch.fee)
          : course?.fee !== null && course?.fee !== undefined
            ? Number(course.fee)
            : null;

      const validEmail = isDeliverable(admission.email) ? (admission.email ?? '').trim() : '';

      // The branch: the application's, else its batch's, else the main one. A
      // student must always belong to exactly one branch.
      let branchId = admission.branch_id ?? batch?.branch_id ?? 0;
      if (!branchId || branchId <= 0) branchId = await mainBranchId();
      const branch = branchId > 0 ? branchId : null;

      /* --- 1. The student -------------------------------------------- */
      let studentId: number;
      const existing = await findStudentForAdmission(admission);

      if (existing) {
        result.linkedExisting = true;
        studentId = existing.id;

        // Fill gaps on the existing record; **never overwrite what is there**.
        // The student's own profile is more current than an application form.
        const fill: Record<string, unknown> = {};
        const gaps: [keyof typeof existing, unknown][] = [
          ['name_bn', admission.fullname_bn],
          ['guardian_phone', admission.guardian_phone],
          ['father_name', admission.father_name],
          ['mother_name', admission.mother_name],
          ['date_of_birth', admission.date_of_birth],
          ['gender', admission.gender],
        ];
        for (const [column, value] of gaps) {
          const current = existing[column];
          if ((current === null || current === '') && value !== null && value !== '') {
            fill[column as string] = value;
          }
        }
        if (!isDeliverable(existing.email) && validEmail !== '') fill.email = validEmail;
        if (admission.photo && (!existing.image || existing.image.includes('default'))) {
          fill.image = admission.photo;
        }
        if (!existing.batch_id && batch) {
          fill.batch_id = batch.id;
          fill.batch = batchName;
          fill.course = courseName;
        }
        // An existing student keeps their home branch; one with none (data from
        // before branches existed) takes this application's.
        if (!existing.branch_id) fill.branch_id = branch;
        if (existing.status !== 'approved') fill.status = 'approved';

        if (Object.keys(fill).length > 0) {
          await tx.student.update({ where: { id: studentId }, data: fill });
        }
      } else {
        const created = await tx.student.create({
          data: {
            name: admission.fullname,
            name_bn: admission.fullname_bn ?? null,
            phone: admission.mobile,
            guardian_phone: admission.guardian_phone ?? null,
            email: validEmail !== '' ? validEmail : NO_EMAIL,
            institution: admission.institution ?? admission.qualification ?? '',
            address: admission.address ?? '',
            course: courseName,
            batch: batchName,
            batch_id: batch ? batch.id : null,
            image: admission.photo ?? '',
            status: 'approved',
            student_status: 'Active',
            father_name: admission.father_name ?? null,
            mother_name: admission.mother_name ?? null,
            date_of_birth: admission.date_of_birth ?? null,
            gender: admission.gender ?? null,
            branch_id: branch,
          },
          select: { id: true },
        });
        studentId = created.id;
      }

      /* --- 2. The enrolment ------------------------------------------ */
      let enrollmentId = 0;
      if (batch) {
        // Re-approving must not enrol the same student in the same batch twice.
        const dupe = await tx.enrollment.findFirst({
          where: { student_id: studentId, batch_id: batch.id, status: 'active' },
          select: { id: true },
        });
        enrollmentId = dupe?.id ?? 0;
      }

      if (enrollmentId > 0) {
        const current = await tx.enrollment.findUnique({
          where: { id: enrollmentId },
          select: { admission_id: true, approved_at: true },
        });
        await tx.enrollment.update({
          where: { id: enrollmentId },
          data: {
            admission_id: current?.admission_id ?? admission.id,
            approved_at: current?.approved_at ?? new Date(),
          },
        });
      } else {
        const created = await tx.enrollment.create({
          data: {
            student_id: studentId,
            course_id: courseId > 0 ? courseId : null,
            batch_id: batch ? batch.id : null,
            admission_id: admission.id,
            course_name: courseName,
            batch_name: batchName,
            batch_type: batchType as 'online' | 'offline' | null,
            fee,
            status: 'active',
            // Enrolled when they applied, approved now: the gap is the office's,
            // not the student's.
            enrolled_at: admission.created_at,
            approved_at: new Date(),
            approved_by: adminId > 0 ? adminId : null,
            notes: reviewNote !== '' ? reviewNote : null,
          },
          select: { id: true },
        });
        enrollmentId = created.id;
      }

      /* --- 3. The verified payment ----------------------------------- */
      if (admission.payment_method && Number(admission.payment_amount ?? 0) > 0) {
        const already = await tx.payment.findFirst({
          where: { admission_id: admission.id },
          select: { id: true },
        });
        if (!already) {
          const amount = Number(admission.payment_amount);
          // What is left of the course fee after this payment, as whole taka.
          const due = fee !== null && fee > amount ? Math.round(fee - amount) : 0;

          await tx.payment.create({
            data: {
              student_id: studentId,
              amount,
              payment_month: 'Admission',
              payment_status: 'paid',
              payment_date: new Date(),
              due_amount: due,
              // Traceable to the application it was verified from.
              receipt_number: `ADM-${admission.application_no ?? admission.id}`,
              payment_method: admission.payment_method === 'bkash' ? 'bKash' : 'Nagad',
              notes:
                `Enrollment fee — ${courseName}${batchName ? ` / ${batchName}` : ''}. ` +
                `Verified from application ${admission.application_no ?? `#${admission.id}`}.`,
              transaction_id: admission.transaction_id ?? null,
              admission_id: admission.id,
              enrollment_id: enrollmentId,
              // Where the money was taken, kept for ever.
              branch_id: branch,
            },
          });
        }
      }

      /* --- 4. The application ---------------------------------------- */
      await tx.admission.update({
        where: { id: admission.id },
        data: {
          status: 'approved',
          student_id: studentId,
          enrollment_id: enrollmentId,
          approved_at: new Date(),
          rejected_at: null,
          reviewed_at: new Date(),
          reviewed_by: adminId > 0 ? adminId : null,
          review_note: reviewNote !== '' ? reviewNote : admission.review_note,
        },
      });

      /* --- 5. The portal login --------------------------------------- */
      const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
      const login = await ensureStudentLogin(tx, student);

      return { student, login, enrollmentId, admission };
    });

    // The Student ID is claimed just after the commit. `ensureStudentId()`
    // returns the existing one or allocates the next, so this covers both a
    // brand-new student and a linked one who predates the feature.
    //
    // It is outside the transaction on purpose: the sequence row is its own
    // atomic write, and holding the enrolment transaction open across it would
    // serialise every concurrent approval behind that one row. If the process
    // died in the gap, the student list flags them under "Without a Student ID"
    // and "Issue ID" finishes the job — the same recovery the original has for
    // students migrated from before IDs existed.
    const studentIdNo = await ensureStudentId(outcome.student.id).catch(
      () => outcome.student.student_id_no
    );

    result.ok = true;
    result.enrollmentId = outcome.enrollmentId;
    result.login = outcome.login;
    result.student = {
      id: outcome.student.id,
      name: outcome.student.name,
      student_id_no: studentIdNo,
      email: outcome.student.email,
      phone: outcome.student.phone,
    };

    /* --- After the commit: notification and email --------------------- */
    try {
      await prisma.notification.create({
        data: {
          user_type: 'student',
          user_id: outcome.student.id,
          title: translate('en', 'notify.enrollment_approved_title', { course: courseName }),
          message: translate('en', 'notify.enrollment_approved_body', {
            course: courseName,
            batch: batchName ?? '',
          }),
          link: '/student',
          icon: 'check-circle',
          is_read: false,
        },
      });
    } catch {
      // A missing notification must not undo an approval.
    }

    if ((options.sendEmail ?? true) && isDeliverable(outcome.student.email)) {
      // The applicant's own language, falling back to the site default.
      const submitted = outcome.admission.submitted_lang ?? '';
      const mailLang: Lang = isLang(submitted)
        ? submitted
        : isLang(await setting('default_language', 'bn'))
          ? ((await setting('default_language', 'bn')) as Lang)
          : 'bn';

      const setupUrl = outcome.login.created
        ? await passwordSetupUrl(outcome.student, outcome.login.loginId, SETUP_HOURS)
        : '';

      const body = await enrollmentApprovedMail(
        outcome.admission,
        { name: outcome.student.name, student_id_no: studentIdNo },
        outcome.login,
        setupUrl,
        SETUP_HOURS,
        mailLang
      );
      const sent = await sendMail({
        to: outcome.student.email,
        toName: outcome.student.name,
        subject: body.subject,
        text: body.text,
        html: body.html,
        template: 'enrollment_approved',
        relatedType: 'admission',
        relatedId: outcome.admission.id,
        studentId: outcome.student.id,
        sentBy: adminId > 0 ? adminId : undefined,
      });
      result.email = { sent: sent.ok, error: sent.error };
    }

    return result;
  } catch (error) {
    const key = error instanceof Error ? error.message : '';
    result.error = translate(
      lang,
      key === 'enroll.err_not_found' || key === 'enroll.err_already_approved'
        ? key
        : 'enroll.err_approve_failed'
    );
    return result;
  }
}

export interface RejectResult {
  ok: boolean;
  error: string;
  email: { sent: boolean; error: string };
}

/**
 * Rejects an application with a reason, which the applicant is told.
 *
 * `paymentProblem` records `payment_rejected` instead of `rejected`, and adds a
 * line to the email: "we could not verify your payment" and "you were not
 * accepted" are very different messages to receive.
 */
export async function rejectAdmission(
  admissionId: number,
  adminId: number,
  reason: string,
  paymentProblem: boolean,
  sendEmail: boolean,
  lang: Lang
): Promise<RejectResult> {
  const result: RejectResult = { ok: false, error: '', email: { sent: false, error: '' } };

  const admission = await prisma.admission.findUnique({ where: { id: admissionId } }).catch(() => null);
  if (!admission) {
    result.error = translate(lang, 'enroll.err_not_found');
    return result;
  }
  // An approved application is not rejected: a student now exists.
  if (admission.status === 'approved') {
    result.error = translate(lang, 'enroll.err_reject_approved');
    return result;
  }

  const trimmed = reason.trim();

  try {
    await prisma.admission.update({
      where: { id: admission.id },
      data: {
        status: paymentProblem ? 'payment_rejected' : 'rejected',
        review_note: trimmed !== '' ? trimmed : null,
        rejected_at: new Date(),
        reviewed_at: new Date(),
        reviewed_by: adminId > 0 ? adminId : null,
      },
    });
  } catch {
    result.error = translate(lang, 'error.generic');
    return result;
  }

  result.ok = true;

  const studentId = admission.applicant_student_id ?? admission.student_id ?? 0;
  if (studentId > 0) {
    try {
      await prisma.notification.create({
        data: {
          user_type: 'student',
          user_id: studentId,
          title: translate('en', 'notify.enrollment_rejected_title', { course: admission.course }),
          message: trimmed,
          link: '/student',
          icon: 'x-circle',
          is_read: false,
        },
      });
    } catch {
      // As above: the decision stands whether or not the bell rings.
    }
  }

  if (sendEmail && isDeliverable(admission.email)) {
    const submitted = admission.submitted_lang ?? '';
    const fallback = await setting('default_language', 'bn');
    const mailLang: Lang = isLang(submitted) ? submitted : isLang(fallback) ? fallback : 'bn';

    const body = await enrollmentRejectedMail(
      admission,
      trimmed !== '' ? trimmed : translate(mailLang, 'enroll.no_reason_given'),
      paymentProblem,
      mailLang
    );
    const sent = await sendMail({
      to: admission.email ?? '',
      toName: admission.fullname,
      subject: body.subject,
      text: body.text,
      html: body.html,
      template: 'enrollment_rejected',
      relatedType: 'admission',
      relatedId: admission.id,
      studentId: studentId > 0 ? studentId : undefined,
      sentBy: adminId > 0 ? adminId : undefined,
    });
    result.email = { sent: sent.ok, error: sent.error };
  }

  return result;
}
