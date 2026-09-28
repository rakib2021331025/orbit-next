import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getTranslator } from '@/lib/i18n';
import { normaliseBdPhone } from '@/lib/auth/phone';
import { readSession } from '@/lib/auth/session';
import { setting, settingLocalized } from '@/lib/settings';
import { publicCourses } from './courses';
import { enrollableBatches, courseIsOpen, courseAcceptsBatchType, batchFee } from './batches';
import { publicBranches, branchCourseIds } from './branches';
import { validateUpload, uniqueFilename, IMAGE_EXTENSIONS } from '@/lib/storage/validate';
import { putFile } from '@/lib/storage/store';
import { throttleStatus, throttleHit, clientIp } from '@/lib/security/throttle';
import {
  emptyApplyValues,
  emptyApplyState,
  type ApplyValues,
  type ApplyState,
} from './apply-form';

export { emptyApplyValues, emptyApplyState, type ApplyValues, type ApplyState };

/**
 * The admission form, from apply.php.
 *
 * **No payment API is integrated, deliberately.** The applicant sends money to
 * the bKash/Nagad number in Admin → Settings and submits the transaction id,
 * sender number, amount and a screenshot. The application stays PENDING until an
 * admin checks it against the wallet statement. Wiring a gateway in would change
 * how the centre reconciles money, which is not a migration decision.
 *
 * Everything is validated on the server, and the course, batch and branch are
 * re-read from the database rather than trusted:
 *
 *   - a batch that has closed, filled up, or belongs to another branch is refused
 *   - a transaction id already used by a non-rejected application is refused,
 *     which is what stops one payment being submitted for two admissions
 *   - a duplicate open application for the same phone and batch is refused,
 *     naming the existing application number so the applicant can track it
 *
 * The screenshot goes to `uploads/payments/` and the optional photo to
 * `uploads/applicants/`. Both are private: readable only through the media route.
 *
 * **Rate limited per IP**, which apply.php was not: each accepted submission
 * writes up to two files to storage and notifies every admin, so an unthrottled
 * form is a way to fill the bucket and the admins' inboxes. The limit is
 * generous (Bangladeshi mobile carriers put many people behind one address) and
 * counts only submissions that get as far as saving.
 */

const APPLY_PER_IP_PER_HOUR = 20;





/** What the form needs to render: open courses, their batches, branches, wallets. */
export async function applyFormData() {
  const [courses, branches, bkash, nagad, instructions, allowPayLater] = await Promise.all([
    publicCourses(),
    publicBranches(),
    setting('bkash_number', ''),
    setting('nagad_number', ''),
    settingLocalized('payment_instructions', ''),
    setting('allow_pay_later', '0'),
  ]);

  const open = courses.filter(courseIsOpen).map((course) => ({
    id: course.id,
    name: course.name,
    name_bn: course.name_bn,
    course_type: course.course_type,
    fee: course.fee === null ? null : Number(course.fee),
    batches: enrollableBatches(course).map((batch) => ({
      id: batch.id,
      name: batch.name,
      name_bn: batch.name_bn,
      batch_type: batch.batch_type,
      branch_id: batch.branch_id,
      capacity: batch.capacity,
      fee: batchFee(batch, course.fee),
    })),
  }));

  const paymentOn = bkash !== '' || nagad !== '';

  return {
    courses: open,
    branches,
    bkash,
    nagad,
    instructions,
    paymentOn,
    // Paying at the office is offered only when an admin allows it — or when no
    // wallet is configured, in which case there is nothing else to do.
    allowPayLater: !paymentOn || allowPayLater === '1',
    counts: await activeBatchCounts(),
  };
}

/** Active enrolments per batch, for the capacity check. */
async function activeBatchCounts(): Promise<Record<number, number>> {
  try {
    const rows = await prisma.enrollment.groupBy({
      by: ['batch_id'],
      where: { status: 'active', batch_id: { not: null } },
      _count: { id: true },
    });
    const out: Record<number, number> = {};
    for (const row of rows) {
      if (row.batch_id !== null) out[row.batch_id] = row._count.id;
    }
    return out;
  } catch {
    return {};
  }
}

/** APP-YYYY-NNNN, continuing this year's sequence. */
async function nextApplicationNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `APP-${year}-`;
  try {
    const rows = await prisma.admission.findMany({
      where: { application_no: { startsWith: prefix } },
      select: { application_no: true },
    });
    const highest = rows.reduce((max, row) => {
      const tail = Number((row.application_no ?? '').split('-').pop());
      return Number.isFinite(tail) && tail > max ? tail : max;
    }, 0);
    return `${prefix}${String(highest + 1).padStart(4, '0')}`;
  } catch {
    return `${prefix}0001`;
  }
}

function text(formData: FormData, field: string, max: number): string {
  return String(formData.get(field) ?? '').trim().slice(0, max);
}

export async function submitApplication(formData: FormData): Promise<ApplyState> {
  const { t, lang } = await getTranslator();

  const values: ApplyValues = {
    batch_id: text(formData, 'batch_id', 12),
    branch_id: text(formData, 'branch_id', 12),
    fullname: text(formData, 'fullname', 255),
    fullname_bn: text(formData, 'fullname_bn', 255),
    father_name: text(formData, 'father_name', 255),
    mother_name: text(formData, 'mother_name', 255),
    mobile: text(formData, 'mobile', 30),
    guardian_phone: text(formData, 'guardian_phone', 30),
    email: text(formData, 'email', 255),
    address: text(formData, 'address', 1000),
    institution: text(formData, 'institution', 255),
    qualification: text(formData, 'qualification', 255),
    date_of_birth: text(formData, 'date_of_birth', 10),
    gender: text(formData, 'gender', 10),
    student_id_input: text(formData, 'student_id_input', 30).toUpperCase(),
    message: text(formData, 'message', 1000),
    payment_method: text(formData, 'payment_method', 10),
    transaction_id: text(formData, 'transaction_id', 40).toUpperCase(),
    sender_number: text(formData, 'sender_number', 30),
    payment_amount: text(formData, 'payment_amount', 12),
  };

  const errors: Record<string, string> = {};

  // Checked before any upload is read or anything is looked up. Its own scope,
  // so the per-IP ceiling shared by the sign-in forms does not apply here.
  const ip = await clientIp();
  const lock = await throttleStatus('apply', ip, APPLY_PER_IP_PER_HOUR, Number.MAX_SAFE_INTEGER, 60);
  if (lock.locked) {
    return { errors: { form: t('ai.err.rate') }, values, done: null };
  }

  const form = await applyFormData();
  const branchesOn = form.branches.length > 0;

  /* -------------------------------------------- course, batch and branch */

  const batchId = /^\d+$/.test(values.batch_id) ? Number(values.batch_id) : 0;
  const course = form.courses.find((row) => row.batches.some((batch) => batch.id === batchId)) ?? null;
  const batch = course?.batches.find((row) => row.id === batchId) ?? null;

  if (batchId === 0) {
    errors.batch_id = t('enroll.err_batch');
  } else if (!batch || !course) {
    // Not in the open list: withdrawn, closed, or never existed.
    errors.batch_id = t('enroll.err_batch_gone');
  } else if (!courseAcceptsBatchType(course.course_type, batch.batch_type)) {
    errors.batch_id = t('enroll.err_course_closed');
  } else if (batch.capacity && (form.counts[batch.id] ?? 0) >= batch.capacity) {
    errors.batch_id = t('enroll.err_batch_full');
  }

  let branchId = 0;
  if (branchesOn) {
    const wanted = /^\d+$/.test(values.branch_id) ? Number(values.branch_id) : 0;
    const valid = form.branches.find((row) => row.id === wanted);
    if (!valid) {
      errors.branch_id = t('enroll.err_branch');
    } else {
      branchId = valid.id;
    }
  }

  // The batch must belong to the chosen branch, and the course must be offered
  // there. A forged or stale branch/batch pair is refused rather than silently
  // filed against the wrong centre.
  if (batch && course && !errors.batch_id) {
    const mainBranch = form.branches.find((row) => row.is_main)?.id ?? 0;
    const batchBranch = batch.branch_id ?? mainBranch;
    if (!branchesOn) {
      branchId = batchBranch;
    } else if (branchId > 0) {
      const offered = await branchCourseIds(branchId);
      if (batchBranch !== branchId || !offered.includes(course.id)) {
        errors.batch_id = t('enroll.err_branch_batch');
      }
    }
  }

  /* ----------------------------------------------------------- applicant */

  // A signed-in student applies as themselves; their own details win.
  const session = await readSession();
  let me: { id: number; name: string; phone: string; email: string; student_id_no: string | null } | null = null;
  if (session?.role === 'student') {
    try {
      me = await prisma.student.findUnique({
        where: { id: session.uid },
        select: { id: true, name: true, phone: true, email: true, student_id_no: true },
      });
    } catch {
      me = null;
    }
  }
  if (me) {
    values.fullname = me.name;
    values.mobile = me.phone;
    values.student_id_input = me.student_id_no ?? '';
    if (me.email) values.email = me.email;
  }

  if (values.fullname.length < 2) errors.fullname = t('enroll.err_fullname');

  if (values.student_id_input !== '' && !/^[A-Z]{1,10}-\d{4}-\d{3,6}$/.test(values.student_id_input)) {
    errors.student_id_input = t('enroll.err_student_id');
  }

  let mobile = normaliseBdPhone(values.mobile);
  if (mobile === null) {
    if (me) {
      // A legacy account may hold an unusual number; keep it as stored rather
      // than blocking the student from applying at all.
      mobile = me.phone;
    } else {
      errors.mobile = t('validation.phone_bd');
    }
  }

  let guardianPhone: string | null = null;
  if (values.guardian_phone !== '') {
    guardianPhone = normaliseBdPhone(values.guardian_phone);
    if (guardianPhone === null) errors.guardian_phone = t('validation.phone_bd');
  }

  if (values.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
    errors.email = t('validation.email');
  }

  if (values.date_of_birth !== '') {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(values.date_of_birth)
      ? new Date(`${values.date_of_birth}T00:00:00`)
      : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      errors.date_of_birth = t('validation.date');
    } else if (parsed > new Date()) {
      errors.date_of_birth = t('enroll.err_dob_future');
    }
  }

  if (values.gender !== '' && !['male', 'female', 'other'].includes(values.gender)) {
    errors.gender = t('enroll.err_gender');
  }
  if (values.address === '') errors.address = t('enroll.err_address');

  /* ----------------------------------- duplicate / already enrolled */

  if (batch && mobile && !errors.batch_id) {
    try {
      const existing = await prisma.admission.findFirst({
        where: {
          mobile,
          batch_id: batch.id,
          status: { in: ['pending', 'under_review', 'payment_verified'] },
        },
        select: { application_no: true },
      });
      if (existing) {
        errors.form = t('enroll.err_duplicate', { app_no: existing.application_no ?? '' });
      }

      const studentId =
        me?.id ??
        (await prisma.student.findFirst({ where: { phone: mobile }, select: { id: true } }))?.id ??
        0;
      if (studentId > 0) {
        const enrolled = await prisma.enrollment.findFirst({
          where: { student_id: studentId, batch_id: batch.id, status: 'active' },
          select: { id: true },
        });
        if (enrolled) errors.form = t('enroll.err_already_enrolled');
      }
    } catch {
      // Requires database configuration.
    }
  }

  /* -------------------------------------------------------------- payment */

  let paymentAmount: number | null = null;
  let senderNumber: string | null = null;
  let screenshot: { bytes: Buffer; ext: string } | null = null;
  const payingNow = values.payment_method !== '' || !form.allowPayLater;

  if (form.paymentOn && payingNow) {
    if (!['bkash', 'nagad'].includes(values.payment_method)) {
      errors.payment_method = t('enroll.err_method');
    } else if (
      (values.payment_method === 'bkash' && form.bkash === '') ||
      (values.payment_method === 'nagad' && form.nagad === '')
    ) {
      errors.payment_method = t('enroll.err_method_unavailable', {
        method: values.payment_method === 'bkash' ? 'bKash' : 'Nagad',
      });
    }

    if (values.transaction_id === '') {
      errors.transaction_id = t('enroll.err_trx');
    } else if (!/^[A-Z0-9]{5,40}$/.test(values.transaction_id)) {
      errors.transaction_id = t('enroll.err_trx_format');
    } else {
      try {
        // One payment, one admission. A rejected application releases its id.
        const used = await prisma.admission.findFirst({
          where: { transaction_id: values.transaction_id, status: { not: 'rejected' } },
          select: { id: true },
        });
        if (used) errors.transaction_id = t('enroll.err_trx_used');
      } catch {
        // Requires database configuration.
      }
    }

    senderNumber = normaliseBdPhone(values.sender_number);
    if (values.sender_number === '' || senderNumber === null) {
      errors.sender_number = t('enroll.err_sender');
    }

    const amount = Number(values.payment_amount);
    if (values.payment_amount === '') {
      errors.payment_amount = t('enroll.err_amount');
    } else if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      errors.payment_amount = t('enroll.err_amount_invalid');
    } else {
      paymentAmount = Math.round(amount * 100) / 100;
    }

    const file = formData.get('payment_screenshot');
    if (!(file instanceof File) || file.size === 0) {
      errors.payment_screenshot = t('enroll.err_screenshot');
    } else {
      const check = await validateUpload(file, IMAGE_EXTENSIONS, 5 * 1024 * 1024);
      if (!check.ok || !check.bytes) {
        errors.payment_screenshot = check.error;
      } else {
        screenshot = { bytes: check.bytes, ext: check.ext };
      }
    }
  } else {
    values.payment_method = '';
  }

  /* ----------------------------------------------------- photo (optional) */

  let photo: { bytes: Buffer; ext: string } | null = null;
  const photoFile = formData.get('photo');
  if (photoFile instanceof File && photoFile.size > 0) {
    const check = await validateUpload(photoFile, IMAGE_EXTENSIONS, 5 * 1024 * 1024);
    if (!check.ok || !check.bytes) {
      errors.photo = check.error;
    } else {
      photo = { bytes: check.bytes, ext: check.ext };
    }
  }

  if (Object.keys(errors).length > 0 || !batch || !course || !mobile) {
    return { errors, values, done: null };
  }

  /* ----------------------------------------------------------------- save */

  // Counted here, once the submission is valid and about to write files.
  await throttleHit('apply', ip);

  // Files are written before the row, so a failed upload does not leave an
  // application claiming a screenshot that is not there.
  let screenshotPath: string | null = null;
  if (screenshot) {
    screenshotPath = await putFile(
      'uploads/payments',
      uniqueFilename(screenshot.ext, 'pay'),
      screenshot.bytes,
      `image/${screenshot.ext === 'jpg' ? 'jpeg' : screenshot.ext}`
    );
    if (!screenshotPath) {
      return { errors: { payment_screenshot: t('upload.save_failed') }, values, done: null };
    }
  }

  let photoPath: string | null = null;
  if (photo) {
    photoPath = await putFile(
      'uploads/applicants',
      uniqueFilename(photo.ext, 'app'),
      photo.bytes,
      `image/${photo.ext === 'jpg' ? 'jpeg' : photo.ext}`
    );
    // A failed photo upload is not fatal: it is optional, and the application
    // matters more than the picture.
  }

  const batchLabel = `${batch.name} (${batch.batch_type === 'online' ? 'Online' : 'Offline'})`;

  try {
    let applicationNo = await nextApplicationNo();
    let created = false;

    // The application number is derived from a MAX(), so two simultaneous
    // applications can pick the same one. Retry on the unique violation rather
    // than locking the table.
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        await prisma.admission.create({
          data: {
            application_no: applicationNo,
            fullname: values.fullname,
            fullname_bn: values.fullname_bn || null,
            father_name: values.father_name || '',
            mother_name: values.mother_name || '',
            mobile,
            guardian_phone: guardianPhone,
            email: values.email || null,
            address: values.address,
            qualification: values.qualification || '',
            institution: values.institution || null,
            date_of_birth: values.date_of_birth ? new Date(`${values.date_of_birth}T00:00:00`) : null,
            gender: values.gender ? (values.gender as 'male' | 'female' | 'other') : null,
            photo: photoPath,
            course_id: course.id,
            course: course.name,
            batch_id: batch.id,
            batch_label: batchLabel,
            batch_type: batch.batch_type,
            message: values.message || null,
            payment_method: values.payment_method
              ? (values.payment_method as 'bkash' | 'nagad')
              : null,
            transaction_id: values.payment_method ? values.transaction_id : null,
            sender_number: values.payment_method ? senderNumber : null,
            payment_amount: values.payment_method ? paymentAmount : null,
            payment_screenshot: screenshotPath,
            // A paid application goes straight to review; an unpaid one waits
            // for the office to collect the fee.
            status: values.payment_method ? 'under_review' : 'pending',
            applicant_student_id: me?.id ?? null,
            student_id_input: values.student_id_input || null,
            submitted_lang: lang,
            branch_id: branchId > 0 ? branchId : null,
          },
        });
        created = true;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'P2002' && attempt < 4) {
          applicationNo = await nextApplicationNo();
          continue;
        }
        throw error;
      }
    }

    // Tell the office: admins of every branch, plus this branch's own.
    try {
      const admins = await prisma.admin.findMany({
        where: { OR: [{ branch_id: null }, { branch_id: branchId > 0 ? branchId : undefined }] },
        select: { id: true },
      });
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          user_type: 'admin' as const,
          user_id: admin.id,
          title: `New enrollment: ${course.name}`,
          message: `${values.fullname} — ${applicationNo}`,
          link: '/admin/applications?state=pending',
          icon: 'person-plus',
          is_read: false,
        })),
      });
    } catch {
      // A missed notification must not fail an application.
    }

    return {
      errors: {},
      values: emptyApplyValues,
      done: {
        applicationNo,
        name: values.fullname,
        course: course.name,
        batch: batchLabel,
        branch: branchId > 0 ? (form.branches.find((b) => b.id === branchId)?.name_en ?? '') : '',
        paid: values.payment_method !== '',
        amount: paymentAmount,
        method: values.payment_method,
      },
    };
  } catch {
    return { errors: { form: t('enroll.err_save') }, values, done: null };
  }
}
