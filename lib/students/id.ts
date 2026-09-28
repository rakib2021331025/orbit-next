import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { setting } from '@/lib/settings';

/**
 * Student IDs and application numbers, from includes/student_id.php.
 *
 * Format: `ORBIT-2026-0001` — `<prefix>-<year>-<sequence>`.
 *
 * **Why a counter table and not `SELECT MAX(...) + 1`:** the obvious version is
 * a lost-update race. Two admissions approved in the same second both read 7,
 * both write 8, and one silently overwrites the other or trips the unique key.
 * The sequence row makes the claim atomic — in Postgres
 *
 *     INSERT … ON CONFLICT (year) DO UPDATE SET last_number = last_number + 1
 *     RETURNING last_number
 *
 * both increments and returns the value this statement reserved, under a row
 * lock, so two concurrent callers always get different numbers. (The original
 * does the same thing with MySQL's `ON DUPLICATE KEY UPDATE` plus
 * `LAST_INSERT_ID(expr)`; `RETURNING` replaces the per-connection read.)
 *
 * Numbers are never reused: deleting a student retires their ID rather than
 * freeing it for the next person — which is what you want for an identifier
 * printed on an ID card.
 *
 * Nothing here is ever driven by client input. The ID is assigned by the server
 * at creation or approval time.
 */

/** "ORBIT" unless Admin → Settings overrides it. */
export async function studentIdPrefix(): Promise<string> {
  const stored = (await setting('student_id_prefix', ''))
    .toUpperCase()
    // Letters only: the value ends up inside an identifier other code splits
    // on '-', so a hyphen in the prefix would break parsing.
    .replace(/[^A-Z]/g, '');
  return stored !== '' ? stored.slice(0, 10) : 'ORBIT';
}

export function formatStudentId(prefix: string, year: number, number: number): string {
  return `${prefix}-${String(year).padStart(4, '0')}-${String(number).padStart(4, '0')}`;
}

/** Claims the next number of the year. Atomic; safe under concurrency. */
async function claimNumber(year: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ last_number: number }[]>`
    INSERT INTO student_id_sequence (year, last_number)
    VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = student_id_sequence.last_number + 1
    RETURNING last_number
  `;
  const next = Number(rows[0]?.last_number ?? 0);
  if (next <= 0) throw new Error('Student ID sequence returned no value.');
  return next;
}

/**
 * The next free Student ID for a year.
 *
 * The sequence alone is authoritative, but an ID could already exist if one was
 * typed in by hand or restored from a backup taken after the counter was reset.
 * Rather than fail the admission, step forward until the ID is genuinely free.
 */
export async function generateStudentId(year?: number): Promise<string> {
  const forYear = year && year > 0 ? year : new Date().getFullYear();
  const prefix = await studentIdPrefix();

  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = formatStudentId(prefix, forYear, await claimNumber(forYear));
    const taken = await prisma.student.findFirst({
      where: { student_id_no: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error('Could not find a free Student ID after 1000 attempts.');
}

/**
 * Assigns an ID to a student who has none yet, and returns the ID either way.
 *
 * **Never overwrites an ID that is already set** — printed cards must stay
 * valid. The number is claimed within the year the student actually joined, so
 * a back-filled ID stays chronologically sensible.
 */
export async function ensureStudentId(studentId: number): Promise<string> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { student_id_no: true, created_at: true },
  });
  if (!student) throw new Error('Student not found.');
  if (student.student_id_no && student.student_id_no.trim() !== '') return student.student_id_no;

  const year = student.created_at ? student.created_at.getFullYear() : new Date().getFullYear();
  const newId = await generateStudentId(year);

  // The WHERE keeps the "never overwrite" rule true even if another request
  // assigned one between the read above and this write.
  const written = await prisma.student.updateMany({
    where: { id: studentId, OR: [{ student_id_no: null }, { student_id_no: '' }] },
    data: { student_id_no: newId },
  });

  if (written.count === 0) {
    const fresh = await prisma.student.findUnique({
      where: { id: studentId },
      select: { student_id_no: true },
    });
    // Theirs wins: the row is the single source of truth.
    return fresh?.student_id_no && fresh.student_id_no !== '' ? fresh.student_id_no : newId;
  }
  return newId;
}

/**
 * The reference number an applicant is shown after submitting, e.g.
 * `APP-2026-0001`.
 *
 * Derived from the admissions table rather than the student sequence: an
 * application is not a student yet, and most never become one. A collision is
 * handled by the caller retrying on the unique key.
 */
export async function generateApplicationNo(year?: number): Promise<string> {
  const forYear = year && year > 0 ? year : new Date().getFullYear();

  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(application_no, '-', 3) AS INTEGER)), 0) AS max
    FROM admissions
    WHERE application_no LIKE ${`APP-${forYear}-%`}
  `;
  const next = Number(rows[0]?.max ?? 0) + 1;
  return `APP-${String(forYear).padStart(4, '0')}-${String(next).padStart(4, '0')}`;
}
