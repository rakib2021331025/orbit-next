'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { deleteFile } from '@/lib/storage/store';
import { approveAdmission, rejectAdmission } from '@/lib/enrollment/approve';
import { emptyApplicationState } from './state';

/**
 * The enrollment queue's actions, from the POST block of admin/applications.php.
 *
 * Every one of them re-reads the application and checks the admin's branch
 * against it, so the id in the form is never the authority on what may be
 * touched.
 *
 * Approving returns the new login's credentials **once**, in the action's own
 * state. The original keeps them in the session for one redirect for the same
 * reason: the temporary password is never stored anywhere readable, so this is
 * the only moment it can be handed over.
 */

export interface ApplicationState {
  error: string;
  message: string;
  /** Extra lines (email sent, linked to an existing account). */
  notes: string[];
  credentials: {
    name: string;
    studentId: string;
    username: string;
    password: string;
    mobile: string;
    studentPk: number;
    /** False when the student already had a login, so no password is shown. */
    isNew: boolean;
  } | null;
}


function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? '');
}

/** The application, if this admin may act on it. */
async function loadApplication(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = await prisma.admission
    .findUnique({
      where: { id },
      select: { id: true, status: true, fullname: true, course: true, email: true, photo: true, payment_screenshot: true },
    })
    .catch(() => null);
  if (!row) return null;

  try {
    await requireRecordBranch('admissions', id, false);
  } catch {
    return null;
  }
  return row;
}

function refresh(): void {
  revalidatePath('/admin/applications');
  revalidatePath('/admin');
  revalidatePath('/admin/students');
}

export async function approveApplicationAction(
  _prev: ApplicationState,
  formData: FormData
): Promise<ApplicationState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('application_id') ?? 0);
  const application = await loadApplication(id);
  if (!application) {
    return { ...emptyApplicationState, error: translate(lang, 'enroll.err_not_found') };
  }

  // The tick-box is the whole point of the screen: it records that a human
  // compared the claim with the bKash/Nagad statement.
  if (formData.get('confirm_checked') === null) {
    return { ...emptyApplicationState, error: translate(lang, 'admin.apps.confirm_required') };
  }

  const sendEmail = formData.get('send_email') !== null;
  const result = await approveAdmission(id, admin.id, text(formData, 'note'), lang, { sendEmail });

  if (!result.ok || !result.student) {
    return { ...emptyApplicationState, error: result.error };
  }

  refresh();

  const notes: string[] = [];
  if (result.linkedExisting) notes.push(translate(lang, 'admin.apps.linked_msg'));
  if (sendEmail) {
    if (result.email.sent) {
      notes.push(translate(lang, 'admin.apps.email_sent', { email: result.student.email }));
    } else if (result.email.error !== '') {
      notes.push(translate(lang, 'admin.apps.email_failed', { error: result.email.error }));
    }
  }

  return {
    error: '',
    message: translate(lang, 'admin.apps.approved_msg', {
      name: result.student.name,
      course: application.course,
      id: result.student.student_id_no ?? '',
    }),
    notes,
    credentials: {
      name: result.student.name,
      studentId: result.student.student_id_no ?? '',
      username: result.login?.username ?? '',
      // Only a login created just now has a password to show.
      password: result.login?.password ?? '',
      mobile: result.student.phone,
      studentPk: result.student.id,
      isNew: result.login?.created ?? false,
    },
  };
}

export async function rejectApplicationAction(
  _prev: ApplicationState,
  formData: FormData
): Promise<ApplicationState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('application_id') ?? 0);
  const application = await loadApplication(id);
  if (!application) {
    return { ...emptyApplicationState, error: translate(lang, 'enroll.err_not_found') };
  }

  // The reason is required because it is sent to the applicant. "Rejected" with
  // no explanation produces a phone call the office then has to answer.
  const reason = text(formData, 'reason').trim();
  if (reason === '') {
    return { ...emptyApplicationState, error: translate(lang, 'admin.apps.reason_required') };
  }

  const sendEmail = formData.get('send_email') !== null;
  const result = await rejectAdmission(
    id,
    admin.id,
    reason.slice(0, 1000),
    formData.get('payment_problem') !== null,
    sendEmail,
    lang
  );

  if (!result.ok) return { ...emptyApplicationState, error: result.error };

  refresh();

  const notes: string[] = [];
  if (result.email.sent) notes.push(translate(lang, 'admin.apps.reject_email_sent'));
  else if (sendEmail && result.email.error !== '') {
    notes.push(translate(lang, 'admin.apps.email_failed', { error: result.email.error }));
  }

  return {
    error: '',
    message: translate(lang, 'admin.apps.rejected_msg'),
    notes,
    credentials: null,
  };
}

/** Moves an application between the pending states. */
export async function setApplicationStatusAction(
  _prev: ApplicationState,
  formData: FormData
): Promise<ApplicationState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('application_id') ?? 0);
  const application = await loadApplication(id);
  if (!application) {
    return { ...emptyApplicationState, error: translate(lang, 'enroll.err_not_found') };
  }
  // An approved application has already produced a student; moving it back to
  // "pending" would make the queue lie about what still needs doing.
  if (application.status === 'approved') {
    return { ...emptyApplicationState, error: translate(lang, 'enroll.err_already_approved') };
  }

  const status = text(formData, 'status');
  if (!['pending', 'under_review', 'payment_verified'].includes(status)) {
    return emptyApplicationState;
  }

  try {
    await prisma.admission.update({
      where: { id },
      data: {
        status: status as 'pending' | 'under_review' | 'payment_verified',
        rejected_at: null,
        reviewed_at: new Date(),
        reviewed_by: admin.id > 0 ? admin.id : null,
      },
    });
  } catch {
    return { ...emptyApplicationState, error: translate(lang, 'error.generic') };
  }

  refresh();
  return { ...emptyApplicationState, message: translate(lang, 'admin.apps.status_msg') };
}

/** The staff-only note on an application. */
export async function saveApplicationNoteAction(
  _prev: ApplicationState,
  formData: FormData
): Promise<ApplicationState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('application_id') ?? 0);
  if (!(await loadApplication(id))) {
    return { ...emptyApplicationState, error: translate(lang, 'enroll.err_not_found') };
  }

  const note = text(formData, 'note').trim().slice(0, 1000);
  try {
    await prisma.admission.update({
      where: { id },
      data: { review_note: note !== '' ? note : null },
    });
  } catch {
    return { ...emptyApplicationState, error: translate(lang, 'error.generic') };
  }

  refresh();
  return { ...emptyApplicationState, message: translate(lang, 'admin.apps.note_saved') };
}

export async function deleteApplicationAction(
  _prev: ApplicationState,
  formData: FormData
): Promise<ApplicationState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('application_id') ?? 0);
  const application = await loadApplication(id);
  if (!application) {
    return { ...emptyApplicationState, error: translate(lang, 'enroll.err_not_found') };
  }
  // An approved application is the record of the student's payment.
  if (application.status === 'approved') {
    return { ...emptyApplicationState, error: translate(lang, 'admin.apps.delete_blocked') };
  }

  const screenshot = application.payment_screenshot ?? '';
  const photo = application.photo ?? '';

  try {
    await prisma.admission.delete({ where: { id } });
  } catch {
    return { ...emptyApplicationState, error: translate(lang, 'error.generic') };
  }

  // Files go after the row, so a failed delete never leaves a row pointing at a
  // missing screenshot.
  if (screenshot !== '') await deleteFile(screenshot);
  if (photo !== '') {
    // The applicant's photo may already have become a student's profile picture,
    // in which case it belongs to the student now and stays.
    const inUse = await prisma.student
      .count({ where: { image: photo } })
      .catch(() => 1);
    if (inUse === 0) await deleteFile(photo);
  }

  refresh();
  return { ...emptyApplicationState, message: translate(lang, 'admin.apps.deleted_msg') };
}
