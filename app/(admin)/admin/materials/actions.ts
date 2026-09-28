'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { contentBranchId } from '@/lib/branch/assign';
import { validateUpload, uniqueFilename, DOCUMENT_EXTENSIONS } from '@/lib/storage/validate';
import { putFile, deleteFile } from '@/lib/storage/store';
import { normaliseStoredPath } from '@/lib/storage/url';
import { audienceOptions, courseAllowed, batchAllowed } from '@/lib/content/audience';

/**
 * Study materials, from admin/study_materials_management.php.
 *
 * The student portal lists a material when its course **or** batch name matches
 * one of the student's, so the form stores names taken from the same lists the
 * students' records use — including the "other" names older records carry.
 *
 * The file is replaced before the row is updated and the **old file is removed
 * only after the row points at the new one**, so a failed save never leaves a row
 * pointing at a file that is gone.
 */

export interface MaterialState {
  error: string;
  message: string;
}

const MAX_MB = 30;
/** What a study material may be: documents and slides, not images or archives. */
const ALLOWED = ['pdf', 'doc', 'docx', 'ppt', 'pptx'] as const;

function refresh(): void {
  revalidatePath('/admin/materials');
  revalidatePath('/student/materials');
}

/** Only ever removes a file inside the materials folder. */
async function removeMaterialFile(path: string | null | undefined): Promise<void> {
  const clean = normaliseStoredPath(path);
  if (clean.startsWith('uploads/materials/')) await deleteFile(clean);
}

export async function saveMaterialAction(
  _prev: MaterialState,
  formData: FormData
): Promise<MaterialState> {
  const admin = await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  let existing: { id: number; file_path: string; file_type: string | null } | null = null;

  if (id > 0) {
    existing = await prisma.studyMaterial
      .findUnique({ where: { id }, select: { id: true, file_path: true, file_type: true } })
      .catch(() => null);
    if (!existing) return { error: translate(lang, 'error.not_found_body'), message: '' };
    await requireRecordBranch('study_materials', id, false);
  }

  const title = String(formData.get('title') ?? '').trim().slice(0, 255);
  const description = String(formData.get('description') ?? '').trim().slice(0, 20000);
  const course = String(formData.get('course') ?? '').trim();
  const batch = String(formData.get('batch') ?? '').trim();

  if (title === '') return { error: translate(lang, 'amat.err_title'), message: '' };

  // The audience names have to be ones actually on offer, so a hand-edited form
  // cannot invent a course and address content to nobody.
  const options = await audienceOptions([course], [batch]);
  if (!courseAllowed(options, course)) {
    return { error: translate(lang, 'amat.err_course'), message: '' };
  }
  if (!batchAllowed(options, batch)) {
    return { error: translate(lang, 'amat.err_batch'), message: '' };
  }

  const upload = formData.get('file');
  let newPath: string | null = null;
  let newType: string | null = null;

  if (upload instanceof File && upload.size > 0) {
    const check = await validateUpload(
      upload,
      ALLOWED.filter((ext) => (DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)),
      MAX_MB * 1048576
    );
    if (!check.ok) {
      return { error: `${translate(lang, 'common.file')}: ${check.error}`, message: '' };
    }

    const stored = await putFile(
      'uploads/materials',
      uniqueFilename(check.ext, 'material'),
      check.bytes ?? Buffer.alloc(0),
      check.mime
    );
    if (stored === null) return { error: translate(lang, 'upload.save_failed'), message: '' };

    newPath = stored;
    newType = check.ext;
  } else if (!existing || existing.file_path.trim() === '') {
    // A material without a file is a title students cannot open.
    return { error: translate(lang, 'amat.err_file'), message: '' };
  }

  const data = {
    title,
    description: description !== '' ? description : null,
    file_path: newPath ?? existing?.file_path ?? '',
    file_type: newType ?? existing?.file_type ?? 'other',
    course,
    batch: batch !== '' ? batch : null,
    branch_id: await contentBranchId(formData.get('branch_id')),
  };

  try {
    if (id > 0) await prisma.studyMaterial.update({ where: { id }, data });
    else await prisma.studyMaterial.create({ data: { ...data, uploaded_by: admin.id } });
  } catch {
    // The row failed, so the file it would have pointed at has no owner.
    if (newPath) await removeMaterialFile(newPath);
    return { error: translate(lang, 'error.generic'), message: '' };
  }

  // Only now is the old file safe to remove.
  if (newPath && existing?.file_path && existing.file_path !== newPath) {
    await removeMaterialFile(existing.file_path);
  }

  refresh();
  return {
    error: '',
    message: translate(lang, id > 0 ? 'amat.updated' : 'amat.created', { title }),
  };
}

export async function deleteMaterialAction(
  _prev: MaterialState,
  formData: FormData
): Promise<MaterialState> {
  await requireAdmin();
  const lang = await getLang();

  const id = Number(formData.get('id') ?? 0);
  const material = await prisma.studyMaterial
    .findUnique({ where: { id }, select: { id: true, title: true, file_path: true } })
    .catch(() => null);
  if (!material) return { error: translate(lang, 'error.not_found_body'), message: '' };

  await requireRecordBranch('study_materials', id, false);

  try {
    await prisma.studyMaterial.delete({ where: { id } });
  } catch {
    return { error: translate(lang, 'error.generic'), message: '' };
  }
  await removeMaterialFile(material.file_path);

  refresh();
  return { error: '', message: translate(lang, 'amat.deleted', { title: material.title }) };
}
