'use server';

import { submitApplication, emptyApplyState, type ApplyState } from '@/lib/site/apply';

/**
 * The admission form's server action.
 *
 * Every rule lives in `lib/site/apply.ts`; this only shapes the result for
 * `useActionState`. A thrown error becomes a form-level message rather than an
 * error page, because an applicant who has just filled in twenty fields should
 * get them back.
 */
export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  try {
    return await submitApplication(formData);
  } catch {
    return { ...emptyApplyState, errors: { form: 'enroll.err_save' } };
  }
}
