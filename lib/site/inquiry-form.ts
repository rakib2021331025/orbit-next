/**
 * The enquiry form's shape and initial state.
 *
 * Deliberately separate from `inquiry.ts`, which is `server-only`: the form is a
 * client component and needs the type and the initial value, but must not pull
 * the database and the spam checks into the browser bundle.
 */

export const HONEYPOT_FIELD = 'company_website';

export const PREFERRED_TIMES = ['any', 'morning', 'afternoon', 'evening'] as const;
export const INQUIRY_SOURCES = ['page', 'home', 'course', 'float'] as const;

export interface InquiryState {
  result: 'created' | 'updated' | 'spam' | 'invalid' | '';
  errors: Record<string, string>;
  general: string;
  old: {
    name: string;
    phone: string;
    course_id: number;
    preferred_time: string;
    message: string;
  };
}

export const emptyInquiryState: InquiryState = {
  result: '',
  errors: {},
  general: '',
  old: { name: '', phone: '', course_id: 0, preferred_time: 'any', message: '' },
};
