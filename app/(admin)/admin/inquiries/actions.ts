'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { saveSetting } from '@/lib/settings/save';
import { phoneMatches } from '@/lib/inquiries/admin';

/**
 * Inquiry actions, from the POST half of admin/inquiries.php.
 *
 * "Admitted" may be linked to the application or student the phone already
 * matches, and that link is **verified against the match list** rather than
 * trusted from the form: linking a lead to somebody else's application would
 * quietly credit the wrong admission.
 */

export interface InquiryState {
  error: string;
  message: string;
}

export interface NotifyState {
  error: string;
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/inquiries');
  revalidatePath('/admin');
}

/** A follow-up date, or null; `false` when what was typed is not a date. */
function followUpDate(raw: string): Date | null | false {
  const value = raw.trim();
  if (value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : false;
}

export async function inquiryAction(
  _prev: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  const admin = await requireSuperAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const action = String(formData.get('act') ?? '');
  const allowed = ['called', 'admitted', 'not_interested', 'reopen', 'note', 'delete'];

  const inquiry = await prisma.inquiry.findUnique({ where: { id } }).catch(() => null);
  if (!inquiry || !allowed.includes(action)) {
    return { error: translate(lang, 'error.not_found_body'), message: '' };
  }

  const note = String(formData.get('admin_note') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 2000);
  const noteValue = note !== '' ? note : null;

  const follow = followUpDate(String(formData.get('follow_up_date') ?? ''));
  if (follow === false) return { error: translate(lang, 'ainq.err_date'), message: '' };

  try {
    switch (action) {
      case 'called':
        await prisma.inquiry.update({
          where: { id },
          data: {
            status: 'called',
            called_at: new Date(),
            admin_note: noteValue,
            follow_up_date: follow,
            handled_by: admin.id > 0 ? admin.id : null,
          },
        });
        return { error: '', message: translate(lang, 'ainq.flash_called') };

      case 'admitted': {
        let admissionId: number | null = null;
        let studentId: number | null = null;
        const link = String(formData.get('link') ?? '');

        if (link !== '') {
          const matches = (await phoneMatches([inquiry.phone])).get(inquiry.phone);
          const application = /^admission:(\d+)$/.exec(link);
          const student = /^student:(\d+)$/.exec(link);
          let ok = false;

          if (application) {
            const found = matches?.admissions.find((row) => row.id === Number(application[1]));
            if (found) {
              ok = true;
              admissionId = found.id;
              studentId = found.student_id;
            }
          } else if (student) {
            const found = matches?.students.find((row) => row.id === Number(student[1]));
            if (found) {
              ok = true;
              studentId = found.id;
            }
          }

          if (!ok) return { error: translate(lang, 'ainq.err_link'), message: '' };
        }

        await prisma.inquiry.update({
          where: { id },
          data: {
            status: 'admitted',
            admitted_at: new Date(),
            admission_id: admissionId,
            student_id: studentId,
            admin_note: noteValue,
            // An admitted lead needs no chasing.
            follow_up_date: null,
            handled_by: admin.id > 0 ? admin.id : null,
          },
        });
        return { error: '', message: translate(lang, 'ainq.flash_admitted') };
      }

      case 'not_interested':
        await prisma.inquiry.update({
          where: { id },
          data: {
            status: 'not_interested',
            admin_note: noteValue,
            follow_up_date: null,
            handled_by: admin.id > 0 ? admin.id : null,
          },
        });
        return { error: '', message: translate(lang, 'ainq.flash_not_interested') };

      case 'reopen':
        await prisma.inquiry.update({
          where: { id },
          data: {
            status: 'new',
            admitted_at: null,
            admission_id: null,
            student_id: null,
            handled_by: admin.id > 0 ? admin.id : null,
          },
        });
        return { error: '', message: translate(lang, 'ainq.flash_reopened') };

      case 'note':
        await prisma.inquiry.update({
          where: { id },
          data: { admin_note: noteValue, follow_up_date: follow },
        });
        return { error: '', message: translate(lang, 'ainq.flash_note') };

      case 'delete':
        await prisma.inquiry.delete({ where: { id } });
        return { error: '', message: translate(lang, 'ainq.flash_deleted') };
    }
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  } finally {
    refresh();
  }

  return { error: translate(lang, 'error.generic'), message: '' };
}

/** Where new-inquiry emails go. Empty means "the institute address". */
export async function saveNotifyEmailAction(
  _prev: NotifyState,
  formData: FormData
): Promise<NotifyState> {
  await requireSuperAdmin();
  const lang = await getLang();

  const email = String(formData.get('inquiry_notify_email') ?? '').trim();
  const valid = email === '' || (email.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (!valid) return { error: translate(lang, 'ainq.err_email'), message: '' };

  if (!(await saveSetting('inquiry_notify_email', email))) {
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  refresh();
  return { error: '', message: translate(lang, 'ainq.notify_saved') };
}
