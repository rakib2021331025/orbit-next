/**
 * Which Supabase Storage bucket a stored upload lives in.
 *
 * The database keeps the path the PHP app wrote — `uploads/materials/ab12.pdf` —
 * and nothing else: no bucket column, no URL, no signed link. The folder decides
 * the bucket, so every existing row keeps working unchanged and a signed URL is
 * never persisted (it would expire, and it would leak access to whoever reads the
 * row). Object keys drop the `uploads/` prefix: bucket `documents`, key
 * `materials/ab12.pdf`.
 *
 * Five buckets, split by WHO may read them, not by what they contain:
 *
 *   public-images  site imagery anybody may see — logo, courses, teachers…   public
 *   gallery        the public photo gallery                                  public
 *   documents      study material, notes, exam/assignment briefs, printables private
 *   student-files  student photos, applicants, submissions & exam answers, AI private
 *   payment-slips  payment screenshots                                       private
 *
 * Separate profile-images / certificates / notes buckets were considered and not
 * made: their readers are the same as one of the above, and a bucket's only job
 * here is to carry one access rule.
 *
 * Deliberately free of `server-only` so the storage scripts in tools/ can use it.
 */

export type BucketName = 'public-images' | 'gallery' | 'documents' | 'student-files' | 'payment-slips';

export interface BucketSpec {
  public: boolean;
  /**
   * Cache-Control stored on each object. Filenames are random and never reused
   * (uniqueFilename()), so a public object's bytes can never change under the
   * same URL — a year, immutable, is safe and lets the CDN absorb the traffic.
   * Private objects are only reached through short signed URLs anyway.
   */
  cacheControl: string;
  /** Enforced by Supabase too, as a second wall behind validateUpload(). */
  maxBytes: number;
  mimeTypes: string[];
}

const IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCS = [
  ...IMAGES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
];

export const BUCKETS: Record<BucketName, BucketSpec> = {
  'public-images': { public: true, cacheControl: 'public, max-age=31536000, immutable', maxBytes: 5 << 20, mimeTypes: IMAGES },
  gallery: { public: true, cacheControl: 'public, max-age=31536000, immutable', maxBytes: 5 << 20, mimeTypes: IMAGES },
  documents: { public: false, cacheControl: 'private, max-age=3600', maxBytes: 25 << 20, mimeTypes: DOCS },
  'student-files': { public: false, cacheControl: 'private, max-age=3600', maxBytes: 10 << 20, mimeTypes: DOCS },
  'payment-slips': { public: false, cacheControl: 'private, max-age=3600', maxBytes: 5 << 20, mimeTypes: IMAGES },
};

/** `uploads/<folder>` → bucket. Anything not listed is treated as private (documents). */
const FOLDERS: Record<string, BucketName> = {
  branding: 'public-images',
  brand: 'public-images',
  director: 'public-images',
  developer: 'public-images',
  courses: 'public-images',
  branches: 'public-images',
  teachers: 'public-images',
  achievements: 'public-images',
  gifts: 'public-images',
  promotions: 'public-images',
  'trial-classes': 'public-images',

  gallery: 'gallery',

  materials: 'documents',
  notes: 'documents',
  printables: 'documents',
  assignments: 'documents',
  live_classes: 'documents',
  exams: 'documents',

  students: 'student-files',
  applicants: 'student-files',
  submissions: 'student-files',
  exam_answers: 'student-files',
  ai: 'student-files',

  payments: 'payment-slips',
};

/** Photos the PHP app wrote straight into uploads/ (13 hex chars): student photos. */
const LEGACY_ROOT = /^uploads\/[0-9a-f]{13}\.(jpe?g|png|gif|webp)$/i;

export interface Located {
  bucket: BucketName;
  key: string;
}

/**
 * Bucket and object key for a stored path, or null for a path that is not an
 * upload at all. The path must already be normalised (normaliseStoredPath).
 */
export function locate(path: string): Located | null {
  if (!path.startsWith('uploads/')) return null;
  if (LEGACY_ROOT.test(path)) return { bucket: 'student-files', key: `legacy/${path.slice('uploads/'.length)}` };

  const rest = path.slice('uploads/'.length);
  const folder = rest.split('/')[0];
  if (rest === folder) return null; // a bare file in uploads/ that is not a legacy photo
  return { bucket: FOLDERS[folder] ?? 'documents', key: rest };
}

/** The stored path for a bucket key — the inverse of locate(). */
export function storedPathFor(bucket: BucketName, key: string): string {
  return bucket === 'student-files' && key.startsWith('legacy/') ? `uploads/${key.slice(7)}` : `uploads/${key}`;
}
