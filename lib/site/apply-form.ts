/**
 * The admission form's shape and initial state.
 *
 * Separate from `apply.ts`, which is `server-only`: the form is a client
 * component and needs these, but must not pull the database, the upload
 * validator and the storage adapter into the browser bundle.
 */

export interface ApplyValues {
  batch_id: string;
  branch_id: string;
  fullname: string;
  fullname_bn: string;
  father_name: string;
  mother_name: string;
  mobile: string;
  guardian_phone: string;
  email: string;
  address: string;
  institution: string;
  qualification: string;
  date_of_birth: string;
  gender: string;
  student_id_input: string;
  message: string;
  payment_method: string;
  transaction_id: string;
  sender_number: string;
  payment_amount: string;
}

export interface ApplyState {
  errors: Record<string, string>;
  values: ApplyValues;
  done: null | {
    applicationNo: string;
    name: string;
    course: string;
    batch: string;
    branch: string;
    paid: boolean;
    amount: number | null;
    method: string;
  };
}

export const emptyApplyValues: ApplyValues = {
  batch_id: '',
  branch_id: '',
  fullname: '',
  fullname_bn: '',
  father_name: '',
  mother_name: '',
  mobile: '',
  guardian_phone: '',
  email: '',
  address: '',
  institution: '',
  qualification: '',
  date_of_birth: '',
  gender: '',
  student_id_input: '',
  message: '',
  payment_method: '',
  transaction_id: '',
  sender_number: '',
  payment_amount: '',
};

export const emptyApplyState: ApplyState = { errors: {}, values: emptyApplyValues, done: null };
