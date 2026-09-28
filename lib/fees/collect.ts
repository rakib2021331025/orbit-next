import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { feeAmount, feeMethod, rowDue, receiptNumber, refreshPlan } from './core';

/**
 * Recording money received against a charge, from fee_collect().
 *
 * The interesting case is a **part payment**. A charge that is paid in parts must
 * still read as one charge, so:
 *
 *   - the first payment updates the original row, setting `due_amount` to what is
 *     left, and
 *   - every later payment inserts a **new** paid row that points back at the
 *     original through `parent_payment_id`, and zeroes the original's remaining
 *     balance.
 *
 * That way the receipt the student is handed matches the money they just gave,
 * while "what is still owed" stays a single number on a single charge.
 *
 * Two refusals are worth keeping in mind:
 *
 *   - **More than is due is refused**, rather than recorded as a credit. There is
 *     nowhere in this schema for a credit to live.
 *   - **A charge from an enrollment application cannot be paid in parts.** It is
 *     the record of one verified transaction; splitting it would make the
 *     application's own record wrong.
 */

export interface CollectResult {
  ok: boolean;
  /** A translation key. */
  error: string;
  paymentId: number;
  studentId: number;
  balance: number;
  status: '' | 'paid' | 'partial';
  amount: number;
}

const fail = (error: string, studentId = 0): CollectResult => ({
  ok: false,
  error,
  paymentId: 0,
  studentId,
  balance: 0,
  status: '',
  amount: 0,
});

export async function collectFee(
  paymentId: number,
  amountRaw: string,
  methodRaw: string,
  transactionRaw: string,
  notesRaw: string,
  adminId: number
): Promise<CollectResult> {
  const method = feeMethod(methodRaw);
  const transaction = transactionRaw.trim().slice(0, 100);
  const notes = notesRaw.trim().slice(0, 1000);
  const amount = feeAmount(amountRaw);

  const charge = await prisma.payment.findUnique({ where: { id: paymentId } }).catch(() => null);
  if (!charge) return fail('fees.err_charge');

  const studentId = charge.student_id;
  const due = rowDue(charge);

  if (due <= 0) return fail('fees.err_nothing_due', studentId);
  if (amount === null) return fail('fees.err_amount', studentId);
  // A tiny tolerance, because 1500.00 read back from a decimal column may be
  // 1499.999999 and refusing that would be maddening.
  if (amount > due + 0.001) return fail('fees.err_amount_over', studentId);
  if (method === null) return fail('fees.err_method', studentId);

  const balance = Math.round((due - amount) * 100) / 100;
  // `due_amount` is whole taka in this schema, so a fractional remainder cannot
  // be stored and is refused rather than silently rounded.
  if (balance > 0 && Math.floor(balance) !== balance) {
    return fail('fees.err_whole_taka', studentId);
  }

  const linked = charge.admission_id !== null || charge.enrollment_id !== null;
  const receipt = await receiptNumber();

  let paidId = 0;
  try {
    if (charge.payment_status !== 'paid') {
      if (linked && balance > 0) return fail('fees.err_linked_partial', studentId);

      await prisma.payment.update({
        where: { id: charge.id },
        data: {
          payment_status: 'paid',
          payment_date: new Date(),
          amount,
          due_amount: balance,
          payment_method: method,
          transaction_id: transaction !== '' ? transaction : charge.transaction_id,
          receipt_number:
            (charge.receipt_number ?? '') === '' ? receipt : charge.receipt_number,
          notes: [charge.notes ?? '', notes].filter((part) => part.trim() !== '').join('\n') || null,
          // What the charge was before any part payment, kept so a receipt can
          // still show the full amount.
          original_amount:
            charge.original_amount ?? Number(charge.amount) + Number(charge.discount_amount ?? 0),
        },
      });
      paidId = charge.id;
    } else {
      // The new part and the zeroing of the original are one change: apart,
      // a failure between them would leave the balance owed twice (both rows
      // carrying it) — a student chased for money already accounted for.
      const created = await prisma.$transaction(async (tx) => {
        const part = await tx.payment.create({
          data: {
            student_id: studentId,
            amount,
            payment_month: charge.payment_month,
            payment_status: 'paid',
            payment_date: new Date(),
            due_amount: balance,
            receipt_number: receipt,
            payment_method: method,
            notes: notes !== '' ? notes : null,
            transaction_id: transaction !== '' ? transaction : null,
            fee_type: charge.fee_type,
            due_date: charge.due_date,
            installment_plan_id: charge.installment_plan_id,
            installment_no: charge.installment_no,
            // Later parts point back at the first row, so the charge stays one
            // thing however many times it was paid.
            parent_payment_id: charge.parent_payment_id ?? charge.id,
            created_by: adminId > 0 ? adminId : null,
            branch_id: charge.branch_id,
          },
          select: { id: true },
        });

        // The original now owes nothing: the outstanding amount moved to the new row.
        await tx.payment.update({ where: { id: charge.id }, data: { due_amount: 0 } });
        return part;
      });
      paidId = created.id;
    }
  } catch {
    return fail('error.generic', studentId);
  }

  await refreshPlan(charge.installment_plan_id);

  return {
    ok: true,
    error: '',
    paymentId: paidId,
    studentId,
    balance,
    status: balance > 0 ? 'partial' : 'paid',
    amount,
  };
}
