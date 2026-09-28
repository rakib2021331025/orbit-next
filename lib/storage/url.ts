/**
 * Turning a stored path into a URL.
 *
 * Orbit stores relative paths like `uploads/students/12.jpg` in the database, and
 * two rules decide what the browser gets:
 *
 *   - **Public** files (gallery images, promo banners) are served directly.
 *   - **Private** files — student photos, applicant photos, payment screenshots,
 *     AI question images — must go through an authorising route. They are personal
 *     data, and a guessable path would hand a student's photo and a parent's
 *     payment screenshot to anyone who tried `/uploads/students/13.jpg`.
 *
 * The private folders are the same four media.php lists, plus the legacy
 * uniqid-named photos the old registration form dropped straight into `uploads/`.
 * Getting that legacy pattern wrong would quietly expose the oldest students'
 * photos, which is exactly the set nobody would think to test.
 */

import { BUCKETS, locate } from './buckets';

const PRIVATE_DIRS = ['uploads/students', 'uploads/applicants', 'uploads/payments', 'uploads/ai'];
const LEGACY_PRIVATE = /^uploads\/[0-9a-f]{13}\.(jpe?g|png|gif|webp)$/i;

/** Normalises a stored path, or returns '' when it is not usable. */
export function normaliseStoredPath(raw: unknown): string {
  const path = String(raw ?? '')
    .trim()
    .replace(/\\/g, '/');
  if (path === '') return '';

  // Absolute paths, control characters and anything with a scheme are refused —
  // a stored value must not be able to point outside the upload area.
  if (path.startsWith('/')) return '';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(path)) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return '';

  // `..` is the whole reason this function exists.
  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return '';
  }
  return path;
}

export function isPrivateUpload(path: string): boolean {
  const clean = normaliseStoredPath(path);
  if (clean === '') return false;
  if (PRIVATE_DIRS.some((dir) => clean.startsWith(`${dir}/`))) return true;
  return LEGACY_PRIVATE.test(clean);
}

/**
 * A URL for a stored file.
 *
 * An `http(s)` value is passed through — some older study materials hold a link
 * to a shared drive rather than a file, as orbit_upload_url() allows.
 */
export function uploadUrl(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (/^https?:\/\//i.test(value)) return value;

  const path = normaliseStoredPath(value);
  if (path === '') return '';

  if (isPrivateUpload(path)) {
    // A private file has no URL of its own: it is only reachable through the
    // media route, addressed by RECORD id rather than by path. A caller who
    // knows the path still cannot fetch it. The caller therefore has to use the
    // matching `*Url()` helper below; reaching here means a private path was
    // passed to the public helper, so nothing is returned.
    return '';
  }
  if ((process.env.ORBIT_STORAGE ?? '').trim().toLowerCase() === 'supabase') {
    const where = locate(path);
    if (!where) return '';
    const encoded = where.key.split('/').map(encodeURIComponent).join('/');
    // Public bucket: the stable CDN URL, fetched by the browser without touching
    // Next.js or the database. Private bucket (study material, notes, exam and
    // assignment files): a route that checks the session, then redirects to a
    // short signed URL.
    if (BUCKETS[where.bucket].public) {
      const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
      return `${base}/storage/v1/object/public/${where.bucket}/${encoded}`;
    }
    return `/api/files/${where.bucket}/${encoded}`;
  }
  return `/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * A student's photo, or '' when there is none.
 *
 * Private, always — a student's face is personal data whichever folder it landed
 * in. `id` goes in the URL so the route can authorise by record rather than by
 * path, which is what media.php does with `?type=student_photo&id=`.
 */
export function studentPhotoUrl(student: { id: number; image?: string | null }): string {
  return normaliseStoredPath(student.image) === '' ? '' : `/api/media/student-photo/${student.id}`;
}

/** An applicant's photo on an admissions row. */
export function applicantPhotoUrl(admission: { id: number; photo?: string | null }): string {
  return normaliseStoredPath(admission.photo) === '' ? '' : `/api/media/applicant-photo/${admission.id}`;
}

/** A payment screenshot on an admissions row. Admin and the applicant only. */
export function paymentScreenshotUrl(admission: { id: number; payment_screenshot?: string | null }): string {
  return normaliseStoredPath(admission.payment_screenshot) === ''
    ? ''
    : `/api/media/payment/${admission.id}`;
}

/** A student's answer file on an assignment submission. */
export function submissionUrl(submission: { id: number; file_path?: string | null }): string {
  return normaliseStoredPath(submission.file_path) === ''
    ? ''
    : `/api/media/submission/${submission.id}`;
}

/** A photo a student attached to an Academic AI question. */
export function aiImageUrl(message: { id: number; image_path?: string | null }): string {
  return normaliseStoredPath(message.image_path) === '' ? '' : `/api/media/ai-image/${message.id}`;
}
