'use server';

import { prisma } from '@/lib/db/prisma';
import { getTranslator } from '@/lib/i18n';
import { throttleStatus, throttleHit, throttleClear } from '@/lib/security/throttle';
import { normaliseBdPhone } from '@/lib/auth/phone';
import { emptyStatusState } from './state';

/**
 * The enrolment status lookup, from check_status.php.
 *
 * It requires the application number **and** the mobile number applied with.
 * The comment in the original explains why: an earlier version looked up by
 * phone or email alone and showed the student's photo, course and attendance to
 * anyone who knew their phone number.
 *
 * POSTed so neither number reaches a URL or a log, and throttled at 8 per
 * application number and 30 per IP in 15 minutes.
 */

export interface StatusState {
  error: string;
  appNo: string;
  mobile: string;
  found: null | {
    applicationNo: string;
    name: string;
    course: string | null;
    batch: string | null;
    status: string;
    submittedAt: string;
    reviewNote: string | null;
    studentIdNo: string | null;
    paid: boolean;
  };
}


/** Digits only, so 0171-234 5678 and +8801712345678 compare equal. */
function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

export async function checkStatusAction(
  _prev: StatusState,
  formData: FormData
): Promise<StatusState> {
  const { t, digits, date } = await getTranslator();

  const appNo = String(formData.get('application_no') ?? '').trim().toUpperCase().slice(0, 40);
  const mobileRaw = String(formData.get('mobile') ?? '').trim();
  const mobile = normaliseBdPhone(mobileRaw);

  const throttle = await throttleStatus('status', appNo, 8, 30, 15);
  if (throttle.locked) {
    return {
      ...emptyStatusState,
      appNo,
      mobile: mobileRaw,
      error: t('error.too_many_attempts', { minutes: digits(throttle.minutes) }),
    };
  }

  if (appNo === '' || mobile === null) {
    // One message for a missing field and for a wrong one: a different message
    // would tell a guesser which half they got right.
    return { ...emptyStatusState, appNo, mobile: mobileRaw, error: t('track.not_found') };
  }

  let admission: {
    application_no: string | null;
    fullname: string;
    course: string | null;
    batch_label: string | null;
    status: string;
    created_at: Date;
    review_note: string | null;
    mobile: string;
    payment_method: string | null;
    student: { student_id_no: string | null } | null;
  } | null = null;

  try {
    const row = await prisma.admission.findFirst({
      where: { application_no: appNo },
      select: {
        application_no: true,
        fullname: true,
        course: true,
        batch_label: true,
        status: true,
        created_at: true,
        review_note: true,
        mobile: true,
        payment_method: true,
        student_id: true,
      },
    });

    if (row) {
      const student = row.student_id
        ? await prisma.student.findUnique({
            where: { id: row.student_id },
            select: { student_id_no: true },
          })
        : null;
      admission = { ...row, student };
    }
  } catch {
    // Requires database configuration.
  }

  if (!admission || digitsOnly(admission.mobile) !== digitsOnly(mobile)) {
    await throttleHit('status', appNo);
    return { ...emptyStatusState, appNo, mobile: mobileRaw, error: t('track.not_found') };
  }

  await throttleClear('status', appNo);

  return {
    error: '',
    appNo,
    mobile: mobileRaw,
    found: {
      applicationNo: admission.application_no ?? appNo,
      name: admission.fullname,
      course: admission.course,
      batch: admission.batch_label,
      status: admission.status,
      submittedAt: date(admission.created_at, 'd M Y'),
      reviewNote: admission.review_note,
      studentIdNo: admission.student?.student_id_no ?? null,
      paid: (admission.payment_method ?? '') !== '',
    },
  };
}
