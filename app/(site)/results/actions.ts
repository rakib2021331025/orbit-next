'use server';

import { getTranslator } from '@/lib/i18n';
import { throttleStatus, throttleHit, throttleClear } from '@/lib/security/throttle';
import { resultLookup } from '@/lib/results/lookup';
import { studentPublishedResults } from '@/lib/results/exam';
import { normaliseStudentIdNo } from '@/lib/results/grades';
import { setting } from '@/lib/settings';
import { emptyResultSearch } from './state';

/**
 * The public result search.
 *
 * A server action, not a GET: the Student ID and the last four digits of a phone
 * number would otherwise land in the URL, the browser history, the referrer
 * header and every access log between here and the visitor.
 *
 * Throttled under scope `result_lookup` at 5 per Student ID and 25 per IP in 15
 * minutes, which is what stops the form being used to enumerate students.
 */

export interface ResultSearchState {
  error: string;
  studentId: string;
  found: null | {
    student: { id: number; name: string; studentIdNo: string | null; roll: string | null; batch: string | null; course: string | null };
    results: {
      examId: number;
      title: string;
      month: string;
      gpa: number | null;
      grade: string;
      totalObtained: number;
      totalFull: number;
      position: number | null;
      hasPosition: boolean;
      passed: boolean;
      complete: boolean;
    }[];
  };
}


export async function searchResultsAction(
  _prev: ResultSearchState,
  formData: FormData
): Promise<ResultSearchState> {
  const { t, digits } = await getTranslator();

  // Switched off by an admin in Admin → Monthly exams → Public results.
  if ((await setting('result_search_public', '1')) !== '1') {
    return { ...emptyResultSearch, error: t('merit.not_found') };
  }

  const studentId = normaliseStudentIdNo(formData.get('student_id'));
  // Never echoed back into the form — it is half of a credential.
  const last4 = String(formData.get('last4') ?? '');
  const examFilter = Number(formData.get('exam') ?? 0);

  if (studentId === '') {
    return { ...emptyResultSearch, error: t('merit.not_found') };
  }

  const throttle = await throttleStatus('result_lookup', studentId, 5, 25, 15);
  if (throttle.locked) {
    return {
      ...emptyResultSearch,
      studentId,
      error: t('error.too_many_attempts', { minutes: digits(throttle.minutes) }),
    };
  }

  const student = await resultLookup(studentId, last4);
  if (!student) {
    await throttleHit('result_lookup', studentId);
    // One generic message whether the ID is unknown or the digits are wrong.
    return { ...emptyResultSearch, studentId, error: t('merit.not_found') };
  }

  await throttleClear('result_lookup', studentId);

  const published = await studentPublishedResults(student.id);
  const results = published
    .filter((entry) => !examFilter || entry.exam.id === examFilter)
    .map((entry) => ({
      examId: entry.exam.id,
      title: entry.exam.title,
      month: entry.exam.exam_month,
      gpa: entry.result.gpa,
      grade: entry.result.grade,
      totalObtained: entry.result.totalObtained,
      totalFull: entry.result.totalFull,
      position: entry.result.position,
      hasPosition: entry.result.hasPosition,
      passed: entry.result.passed,
      complete: entry.result.complete,
    }));

  return {
    error: '',
    studentId,
    found: {
      student: {
        id: student.id,
        name: student.name,
        studentIdNo: student.student_id_no,
        roll: student.roll_number,
        batch: student.batch_name,
        course: student.course_name,
      },
      results,
    },
  };
}
