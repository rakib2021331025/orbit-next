'use client';

import { useActionState, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea, Checkbox, FieldGrid, FormActions } from '@/components/ui/Form';
import { Button, ButtonLink } from '@/components/ui/Button';
import { applyAction } from './actions';
import { emptyApplyState, type ApplyState } from '@/lib/site/apply-form';
import { cn } from '@/lib/cn';

export interface ApplyBatch {
  id: number;
  name: string;
  batch_type: string;
  branch_id: number | null;
  capacity: number | null;
  fee: number | null;
  seatsLeft: number | null;
  full: boolean;
}

export interface ApplyCourse {
  id: number;
  name: string;
  batches: ApplyBatch[];
}

/**
 * The admission form.
 *
 * One form, posted once. The three steps are presentation only — every field is
 * in the DOM and validated together on the server, so the form still works with
 * JavaScript off, which is the original's stated design and matters for students
 * applying from a cheap phone on a bad connection.
 *
 * Choosing a branch filters the batches on screen, but the server re-checks that
 * the batch really belongs to that branch. The filter is a convenience; the check
 * is the rule.
 */
export function ApplyForm({
  courses,
  branches,
  payment,
  signedInAs,
  labels,
  defaultCourseId,
  defaultBatchId,
  defaultBranchId,
}: {
  courses: ApplyCourse[];
  branches: { id: number; name: string }[];
  payment: {
    on: boolean;
    allowPayLater: boolean;
    bkash: string;
    nagad: string;
    instructions: string;
  };
  signedInAs: { name: string; studentId: string } | null;
  defaultCourseId?: number;
  defaultBatchId?: number;
  defaultBranchId?: number;
  labels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(applyAction, emptyApplyState);

  const [branchId, setBranchId] = useState<number>(defaultBranchId ?? 0);
  const [batchId, setBatchId] = useState<number>(defaultBatchId ?? 0);
  const [method, setMethod] = useState<string>(payment.allowPayLater ? '' : 'bkash');

  if (state.done) {
    return <SuccessCard done={state.done} labels={labels} />;
  }

  // A batch with no branch belongs to every branch, so it stays visible whichever
  // branch is chosen.
  const visible = courses
    .map((course) => ({
      ...course,
      batches: course.batches.filter(
        (batch) => branchId === 0 || batch.branch_id === null || batch.branch_id === branchId
      ),
    }))
    .filter((course) => course.batches.length > 0);

  const chosen = visible.flatMap((course) => course.batches).find((batch) => batch.id === batchId);

  return (
    <form action={formAction} className="space-y-6" encType="multipart/form-data">
      {state.errors.form && <Alert tone="danger">{state.errors.form}</Alert>}

      {signedInAs && (
        <Alert tone="info" icon="bi-person-check">
          {labels.signedInAs
            .replace('{name}', signedInAs.name)
            .replace('{id}', signedInAs.studentId)}
        </Alert>
      )}

      {/* ------------------------------------------------ 1. course and batch */}
      <Card>
        <CardHeader
          title={`১. ${labels.stepCourse}`}
          subtitle={labels.chooseCourseHelp}
          icon="bi-journal-bookmark"
        />
        <CardBody className="space-y-5">
          {branches.length > 0 && (
            <Field id="branch_id" label={labels.branchTitle} hint={labels.branchHelp} error={state.errors.branch_id} required>
              <Select
                id="branch_id"
                name="branch_id"
                required
                value={String(branchId)}
                error={Boolean(state.errors.branch_id)}
                onChange={(event) => {
                  setBranchId(Number(event.currentTarget.value));
                  // The chosen batch may not exist at the new branch.
                  setBatchId(0);
                }}
              >
                <option value="0">{labels.branchFirst}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {visible.length === 0 ? (
            <Alert tone="warning">
              {branches.length > 0 && branchId > 0 ? labels.branchNoBatches : labels.noCourses}
            </Alert>
          ) : (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">{labels.stepCourse}</legend>
              {state.errors.batch_id && (
                <p className="mb-2 text-xs font-medium text-red-600">{state.errors.batch_id}</p>
              )}

              <div className="space-y-4">
                {visible.map((course) => (
                  <div key={course.id}>
                    <p className="mb-1.5 text-sm font-semibold text-ink-heading">{course.name}</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {course.batches.map((batch) => (
                        <li key={batch.id}>
                          <label
                            className={cn(
                              'flex cursor-pointer items-start gap-2.5 rounded-orbit border p-3 text-sm transition',
                              batch.full && 'cursor-not-allowed opacity-60',
                              batchId === batch.id
                                ? 'border-primary bg-primary-soft'
                                : 'border-line bg-surface hover:bg-surface-2'
                            )}
                          >
                            <input
                              type="radio"
                              name="batch_id"
                              value={batch.id}
                              required
                              disabled={batch.full}
                              checked={batchId === batch.id}
                              onChange={() => setBatchId(batch.id)}
                              className="mt-0.5 h-4 w-4 border-line text-primary focus:ring-primary/30"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-ink">{batch.name}</span>
                              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Badge tone={batch.batch_type === 'online' ? 'info' : 'neutral'}>
                                  {batch.batch_type === 'online' ? labels.typeOnline : labels.typeOffline}
                                </Badge>
                                {batch.fee !== null && (
                                  <span className="text-xs font-medium text-primary">৳{batch.fee}</span>
                                )}
                                {batch.full ? (
                                  <Badge tone="danger">{labels.batchFull}</Badge>
                                ) : (
                                  batch.seatsLeft !== null &&
                                  batch.seatsLeft <= 5 && (
                                    <Badge tone="warning">
                                      {labels.seatsLeft.replace('{n}', String(batch.seatsLeft))}
                                    </Badge>
                                  )
                                )}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </fieldset>
          )}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------- 2. your details */}
      <Card>
        <CardHeader title={`২. ${labels.stepDetails}`} subtitle={labels.requiredNote} icon="bi-person-lines-fill" />
        <CardBody className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-ink-heading">{labels.secStudent}</h3>
            <FieldGrid>
              <Field id="fullname" label={labels.fullname} error={state.errors.fullname} required>
                <Input
                  id="fullname"
                  name="fullname"
                  required
                  autoComplete="name"
                  defaultValue={state.values.fullname}
                  readOnly={Boolean(signedInAs)}
                  error={Boolean(state.errors.fullname)}
                />
              </Field>

              <Field id="fullname_bn" label={labels.fullnameBn} hint={labels.fullnameBnHelp}>
                <Input id="fullname_bn" name="fullname_bn" defaultValue={state.values.fullname_bn} />
              </Field>

              <Field id="date_of_birth" label={labels.dob} error={state.errors.date_of_birth}>
                <Input
                  id="date_of_birth"
                  name="date_of_birth"
                  type="date"
                  defaultValue={state.values.date_of_birth}
                  error={Boolean(state.errors.date_of_birth)}
                />
              </Field>

              <Field id="gender" label={labels.gender} error={state.errors.gender}>
                <Select id="gender" name="gender" defaultValue={state.values.gender}>
                  <option value="">{labels.genderNone}</option>
                  <option value="male">{labels.genderMale}</option>
                  <option value="female">{labels.genderFemale}</option>
                  <option value="other">{labels.genderOther}</option>
                </Select>
              </Field>

              <Field id="photo" label={labels.photo} hint={labels.photoHelp} error={state.errors.photo}>
                <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
              </Field>

              <Field
                id="student_id_input"
                label={labels.studentId}
                hint={signedInAs ? labels.studentIdLocked : labels.existingStudentHelp}
                error={state.errors.student_id_input}
              >
                <Input
                  id="student_id_input"
                  name="student_id_input"
                  placeholder="ORBIT-2026-0001"
                  defaultValue={state.values.student_id_input}
                  readOnly={Boolean(signedInAs)}
                  error={Boolean(state.errors.student_id_input)}
                />
              </Field>
            </FieldGrid>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-ink-heading">{labels.secContact}</h3>
            <FieldGrid>
              <Field id="mobile" label={labels.mobile} hint={labels.mobileHelp} error={state.errors.mobile} required>
                <Input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  required
                  inputMode="numeric"
                  autoComplete="tel"
                  defaultValue={state.values.mobile}
                  readOnly={Boolean(signedInAs)}
                  error={Boolean(state.errors.mobile)}
                />
              </Field>

              <Field id="email" label={labels.email} hint={labels.emailHelp} error={state.errors.email}>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={state.values.email}
                  error={Boolean(state.errors.email)}
                />
              </Field>

              <Field id="address" label={labels.address} error={state.errors.address} required className="sm:col-span-2">
                <Textarea
                  id="address"
                  name="address"
                  required
                  defaultValue={state.values.address}
                  error={Boolean(state.errors.address)}
                />
              </Field>
            </FieldGrid>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-ink-heading">{labels.secGuardian}</h3>
            <FieldGrid>
              <Field id="father_name" label={labels.father}>
                <Input id="father_name" name="father_name" defaultValue={state.values.father_name} />
              </Field>
              <Field id="mother_name" label={labels.mother}>
                <Input id="mother_name" name="mother_name" defaultValue={state.values.mother_name} />
              </Field>
              <Field
                id="guardian_phone"
                label={labels.guardianPhone}
                error={state.errors.guardian_phone}
              >
                <Input
                  id="guardian_phone"
                  name="guardian_phone"
                  type="tel"
                  inputMode="numeric"
                  defaultValue={state.values.guardian_phone}
                  error={Boolean(state.errors.guardian_phone)}
                />
              </Field>
            </FieldGrid>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-ink-heading">{labels.secAcademic}</h3>
            <FieldGrid>
              <Field id="institution" label={labels.institution}>
                <Input id="institution" name="institution" defaultValue={state.values.institution} />
              </Field>
              <Field id="qualification" label={labels.className} hint={labels.classPlaceholder}>
                <Input id="qualification" name="qualification" defaultValue={state.values.qualification} />
              </Field>
              <Field id="message" label={labels.message} className="sm:col-span-2">
                <Textarea id="message" name="message" defaultValue={state.values.message} />
              </Field>
            </FieldGrid>
          </section>
        </CardBody>
      </Card>

      {/* --------------------------------------------------------- 3. payment */}
      <Card>
        <CardHeader
          title={`৩. ${labels.stepPayment}`}
          subtitle={payment.on ? labels.paymentHelp : undefined}
          icon="bi-cash-coin"
        />
        <CardBody className="space-y-5">
          {!payment.on ? (
            <Alert tone="info">{labels.paymentUnavailable}</Alert>
          ) : (
            <>
              <div className="rounded-orbit border border-line-soft bg-surface-2 p-4">
                <p className="text-sm font-semibold text-ink-heading">{labels.howToPay}</p>
                <ul className="mt-2 space-y-1.5 text-sm text-ink">
                  {payment.bkash !== '' && (
                    <li className="flex flex-wrap items-center gap-2">
                      <Badge tone="danger">{labels.bkash}</Badge>
                      {labels.sendMoneyBkash}:
                      <strong className="tabular-nums">{payment.bkash}</strong>
                    </li>
                  )}
                  {payment.nagad !== '' && (
                    <li className="flex flex-wrap items-center gap-2">
                      <Badge tone="warning">{labels.nagad}</Badge>
                      {labels.sendMoneyNagad}:
                      <strong className="tabular-nums">{payment.nagad}</strong>
                    </li>
                  )}
                </ul>
                {payment.instructions !== '' && (
                  <p className="mt-3 whitespace-pre-line text-sm text-ink-muted">{payment.instructions}</p>
                )}
                {chosen?.fee != null && (
                  <p className="mt-3 text-sm">
                    {labels.amountDue}: <strong className="text-primary">৳{chosen.fee}</strong>
                  </p>
                )}
              </div>

              <Field id="payment_method" label={labels.method} error={state.errors.payment_method} required={!payment.allowPayLater}>
                <Select
                  id="payment_method"
                  name="payment_method"
                  value={method}
                  onChange={(event) => setMethod(event.currentTarget.value)}
                  error={Boolean(state.errors.payment_method)}
                >
                  {payment.allowPayLater && <option value="">{labels.methodLater}</option>}
                  {payment.bkash !== '' && <option value="bkash">{labels.bkash}</option>}
                  {payment.nagad !== '' && <option value="nagad">{labels.nagad}</option>}
                </Select>
              </Field>

              {method !== '' && (
                <FieldGrid>
                  <Field id="transaction_id" label={labels.trx} hint={labels.trxHelp} error={state.errors.transaction_id} required>
                    <Input
                      id="transaction_id"
                      name="transaction_id"
                      required
                      autoComplete="off"
                      defaultValue={state.values.transaction_id}
                      error={Boolean(state.errors.transaction_id)}
                    />
                  </Field>

                  <Field id="sender_number" label={labels.sender} hint={labels.senderHelp} error={state.errors.sender_number} required>
                    <Input
                      id="sender_number"
                      name="sender_number"
                      type="tel"
                      required
                      inputMode="numeric"
                      defaultValue={state.values.sender_number}
                      error={Boolean(state.errors.sender_number)}
                    />
                  </Field>

                  <Field id="payment_amount" label={labels.amount} error={state.errors.payment_amount} required>
                    <Input
                      id="payment_amount"
                      name="payment_amount"
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      defaultValue={state.values.payment_amount || (chosen?.fee ?? '')}
                      error={Boolean(state.errors.payment_amount)}
                    />
                  </Field>

                  <Field
                    id="payment_screenshot"
                    label={labels.screenshot}
                    hint={labels.screenshotHelp}
                    error={state.errors.payment_screenshot}
                    required
                  >
                    <Input
                      id="payment_screenshot"
                      name="payment_screenshot"
                      type="file"
                      required
                      accept="image/jpeg,image/png,image/webp"
                    />
                  </Field>
                </FieldGrid>
              )}
            </>
          )}

          <Alert tone="neutral" icon="bi-shield-lock">
            {labels.secureNote}
          </Alert>

          <Checkbox name="confirm" required label={labels.confirm} />

          <FormActions>
            <Button type="submit" size="lg" disabled={pending} icon="bi-send">
              {pending ? labels.submitting : labels.submit}
            </Button>
          </FormActions>
        </CardBody>
      </Card>
    </form>
  );
}

type ApplyDone = NonNullable<ApplyState['done']>;

function SuccessCard({ done, labels }: { done: ApplyDone; labels: Record<string, string> }) {
  return (
    <Card>
      <CardBody className="py-10 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <i className="bi bi-check-lg" aria-hidden />
        </span>

        <h2 className="mt-5 font-head text-xl font-semibold text-ink-heading">{labels.successTitle}</h2>
        <p className="mx-auto mt-2 max-w-lg text-ink-muted">
          {labels.successText.replace('{name}', done.name)}
        </p>

        <div className="mx-auto mt-6 max-w-sm rounded-orbit border border-line bg-surface-2 p-5">
          <p className="text-xs uppercase tracking-wide text-ink-muted">{labels.appNo}</p>
          <p className="mt-1 font-head text-2xl font-semibold tabular-nums text-primary">
            {done.applicationNo}
          </p>
          <p className="mt-2 text-xs text-ink-muted">{labels.appNoHelp}</p>
        </div>

        <dl className="mx-auto mt-6 max-w-sm space-y-2 text-start text-sm">
          <Row label={labels.stepCourse} value={`${done.course} — ${done.batch}`} />
          {done.branch !== '' && <Row label={labels.branchTitle} value={done.branch} />}
          <Row
            label={labels.stepPayment}
            value={done.paid ? labels.statusPendingPaid : labels.statusPendingUnpaid}
          />
        </dl>

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/check-status" variant="primary" icon="bi-search">
            {labels.checkStatus}
          </ButtonLink>
          <ButtonLink href="/" variant="secondary">
            {labels.backHome}
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line-soft pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-end font-medium text-ink">{value}</dd>
    </div>
  );
}
