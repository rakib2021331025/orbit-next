import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { normaliseStudentIdNo, toLatinDigits } from './grades';
import { normaliseBdPhone } from '@/lib/auth/phone';

/**
 * The public result lookup: Student ID plus the last four digits of the
 * student's OR their guardian's registered mobile.
 *
 * Four properties of the original are load-bearing and kept exactly:
 *
 *   1. **Both numbers are always compared.** No early exit — otherwise the
 *      response time tells an attacker whether the student's own number matched.
 *   2. **The comparison is constant-time**, for the same reason.
 *   3. A student with no stored number compares against `'----'`, which never
 *      matches four digits. Comparing against `''` would let an empty guess in.
 *   4. **One generic failure**, so nobody can discover which Student IDs exist.
 *
 * Only approved, currently active students are found: a result lookup is not a
 * way to confirm that somebody was once enrolled.
 */

export interface LookupStudent {
  id: number;
  student_id_no: string | null;
  name: string;
  name_bn: string | null;
  image: string;
  roll_number: string | null;
  batch_name: string | null;
  course_name: string | null;
}

/** Last four digits of a valid BD mobile, or '' when it is not one. */
function phoneLast4(phone: unknown): string {
  const normalised = normaliseBdPhone(phone);
  return normalised === null ? '' : normalised.slice(-4);
}

/** Constant-time compare of two short strings. */
function sameDigits(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function resultLookup(
  studentIdNo: unknown,
  last4Input: unknown
): Promise<LookupStudent | null> {
  const idNo = normaliseStudentIdNo(studentIdNo);
  const last4 = toLatinDigits(last4Input).replace(/\D+/g, '');
  if (idNo === '' || last4.length !== 4) return null;

  let student: {
    id: number;
    student_id_no: string | null;
    name: string;
    name_bn: string | null;
    image: string;
    roll_number: string | null;
    phone: string;
    guardian_phone: string | null;
    batch_id: number | null;
  } | null = null;

  try {
    student = await prisma.student.findFirst({
      where: { student_id_no: idNo, status: 'approved', student_status: 'Active' },
      select: {
        id: true,
        student_id_no: true,
        name: true,
        name_bn: true,
        image: true,
        roll_number: true,
        phone: true,
        guardian_phone: true,
        batch_id: true,
      },
    });
  } catch {
    return null;
  }

  // Both comparisons always run, even when there is no student, so the timing
  // does not distinguish "no such ID" from "wrong digits".
  const own = student ? phoneLast4(student.phone) : '';
  const guardian = student ? phoneLast4(student.guardian_phone) : '';
  const matchedOwn = sameDigits(own !== '' ? own : '----', last4);
  const matchedGuardian = sameDigits(guardian !== '' ? guardian : '----', last4);

  if (!student || !(matchedOwn || matchedGuardian)) return null;

  let batchName: string | null = null;
  let courseName: string | null = null;
  if (student.batch_id) {
    try {
      const batch = await prisma.batch.findUnique({
        where: { id: student.batch_id },
        select: { name: true, course: { select: { name: true } } },
      });
      batchName = batch?.name ?? null;
      courseName = batch?.course?.name ?? null;
    } catch {
      // Names are decoration on the result card; their absence is not a failure.
    }
  }

  return {
    id: student.id,
    student_id_no: student.student_id_no,
    name: student.name,
    name_bn: student.name_bn,
    image: student.image,
    roll_number: student.roll_number,
    batch_name: batchName,
    course_name: courseName,
  };
}
