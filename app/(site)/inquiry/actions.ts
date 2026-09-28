'use server';

import { submitInquiry, emptyInquiryState, type InquiryState } from '@/lib/site/inquiry';

/**
 * The enquiry form's server action.
 *
 * All the spam and validation logic lives in `lib/site/inquiry.ts` so the home
 * page's inline form and the standalone page share one implementation — and one
 * set of defences.
 */
export async function inquiryAction(
  _prev: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  try {
    return await submitInquiry(formData);
  } catch {
    return { ...emptyInquiryState, general: 'error.generic' };
  }
}
