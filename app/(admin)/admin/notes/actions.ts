'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { toLocalDigits } from '@/lib/i18n/format';
import { mailIsConfigured } from '@/lib/email/send';
import { deleteFile, putFile } from '@/lib/storage/store';
import { uniqueFilename, validateUpload } from '@/lib/storage/validate';
import { groupAllowed, groupOptions, sendNote } from '@/lib/notes/admin';

/**
 * Note actions, from the POST half of admin/note_management.php.
 *
 * The PDF is capped at 10 MB because it is **also an email attachment**: a
 * larger file is rejected by the mail provider, and a note that cannot be sent
 * defeats the point of the page.
 */

const MAX_MB = 10;

export interface NoteState {
  errors: string[];
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/notes');
  // Notes appear on the students' study materials page.
  revalidatePath('/student/materials');
}

export async function saveNoteAction(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const admin = await requireAdmin();
  const lang = await getLang();
  const errors: string[] = [];

  const id = Number(formData.get('id') ?? 0);
  const existing =
    id > 0 ? await prisma.adminNote.findUnique({ where: { id } }).catch(() => null) : null;
  if (id > 0 && !existing) {
    return { errors: [translate(lang, 'error.not_found_body')], message: '' };
  }

  const title = String(formData.get('title') ?? '').trim().slice(0, 255);
  const message = String(formData.get('message') ?? '').trim().slice(0, 5000);
  const group = String(formData.get('batch') ?? '').trim();

  if (title === '') errors.push(translate(lang, 'anote.err_title'));
  if (!groupAllowed(await groupOptions(lang), group)) {
    errors.push(translate(lang, 'anote.err_group'));
  }

  const upload = formData.get('pdf_file');
  let newPath: string | null = null;

  if (upload instanceof File && upload.size > 0) {
    const check = await validateUpload(upload, ['pdf'], MAX_MB * 1048576);
    if (!check.ok) {
      errors.push(`${translate(lang, 'anote.pdf')}: ${check.error}`);
    } else if (errors.length === 0) {
      newPath = await putFile(
        'uploads/notes',
        uniqueFilename(check.ext, 'note'),
        check.bytes ?? Buffer.alloc(0),
        check.mime
      );
      if (newPath === null) errors.push(translate(lang, 'upload.save_failed'));
    }
  } else if (!existing || existing.pdf_path.trim() === '') {
    // A note with no PDF is a title nobody can open, and nothing to attach.
    errors.push(translate(lang, 'anote.err_pdf'));
  }

  if (errors.length > 0) {
    // A file already written for a save that then failed is rubbish on disk.
    if (newPath !== null) await deleteFile(newPath);
    return { errors, message: '' };
  }

  const pdfPath = newPath ?? existing?.pdf_path ?? '';

  try {
    if (id > 0) {
      await prisma.adminNote.update({
        where: { id },
        data: { title, message: message !== '' ? message : null, pdf_path: pdfPath, batch: group },
      });
    } else {
      await prisma.adminNote.create({
        data: {
          title,
          message: message !== '' ? message : null,
          pdf_path: pdfPath,
          batch: group,
          created_by: admin.id,
        },
      });
    }
  } catch {
    if (newPath !== null) await deleteFile(newPath);
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  // The old file goes only after the row points at the new one.
  if (newPath !== null && existing && existing.pdf_path !== '' && existing.pdf_path !== newPath) {
    await deleteFile(existing.pdf_path);
  }

  refresh();
  return {
    errors: [],
    message: translate(lang, id > 0 ? 'anote.updated' : 'anote.created', { title }),
  };
}

export async function deleteNoteAction(_prev: NoteState, formData: FormData): Promise<NoteState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const note = await prisma.adminNote.findUnique({ where: { id } }).catch(() => null);
  if (!note) return { errors: [translate(lang, 'error.not_found_body')], message: '' };

  try {
    // note_email_logs has no foreign key, so its rows are removed explicitly —
    // and in the same transaction, or a failed delete would lose the history of
    // a note that still exists.
    await prisma.$transaction([
      prisma.noteEmailLog.deleteMany({ where: { note_id: id } }),
      prisma.adminNote.delete({ where: { id } }),
    ]);
  } catch {
    return { errors: [translate(lang, 'error.generic')], message: '' };
  }

  await deleteFile(note.pdf_path);
  refresh();
  return { errors: [], message: translate(lang, 'anote.deleted', { title: note.title }) };
}

export async function sendNoteAction(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const noteId = Number(formData.get('note_id') ?? 0);
  const group = String(formData.get('batch') ?? '').trim();

  if (noteId <= 0 || !groupAllowed(await groupOptions(lang), group)) {
    return { errors: [translate(lang, 'anote.err_send_choose')], message: '' };
  }
  if (!mailIsConfigured()) {
    return { errors: [translate(lang, 'mail.not_configured')], message: '' };
  }

  const outcome = await sendNote(noteId, group, admin.id);
  if (!outcome.ok) {
    return {
      errors: [translate(lang, outcome.error, { group, title: outcome.title })],
      message: '',
    };
  }

  refresh();

  const errors: string[] = [];
  if (outcome.failed > 0) {
    errors.push(
      translate(lang, 'anote.send_failed', { count: toLocalDigits(outcome.failed, lang) })
    );
  }
  if (outcome.skipped > 0) {
    errors.push(
      translate(lang, 'anote.send_skipped', { count: toLocalDigits(outcome.skipped, lang) })
    );
  }

  return {
    errors,
    message:
      outcome.sent > 0
        ? translate(lang, 'anote.sent', {
            count: toLocalDigits(outcome.sent, lang),
            title: outcome.title,
          })
        : '',
  };
}
