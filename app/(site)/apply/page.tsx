import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { PageHeader, PageBody } from '@/components/site/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { getTranslator, getLang, translate } from '@/lib/i18n';
import { helplineNumber } from '@/lib/settings';
import { applyFormData } from '@/lib/site/apply';
import { readSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { formatPhone, telHref } from '@/lib/site/url';
import { ApplyForm } from './ApplyForm';

// Capacity and the signed-in applicant are both per-request.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: translate(lang, 'enroll.page_title'),
    description: translate(lang, 'enroll.meta'),
  };
}

/**
 * The admission form, from apply.php.
 *
 * `?course=` and `?batch=` preselect from a course page; `?branch=` from a branch
 * page. All three are only defaults — the server re-reads and re-validates every
 * one of them on submit.
 */
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; batch?: string; branch?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslator();

  const [form, helpline, session] = await Promise.all([
    applyFormData(),
    helplineNumber(),
    readSession(),
  ]);

  // A signed-in student applies as themselves, so their own details are fixed.
  let signedInAs: { name: string; studentId: string } | null = null;
  if (session?.role === 'student') {
    try {
      const me = await prisma.student.findUnique({
        where: { id: session.uid },
        select: { name: true, student_id_no: true },
      });
      if (me) signedInAs = { name: me.name, studentId: me.student_id_no ?? '' };
    } catch {
      signedInAs = null;
    }
  }

  const courses = form.courses.map((course) => ({
    id: course.id,
    name: t.pick(course, 'name'),
    batches: course.batches.map((batch) => {
      const taken = form.counts[batch.id] ?? 0;
      const seatsLeft = batch.capacity ? Math.max(0, batch.capacity - taken) : null;
      return {
        id: batch.id,
        name: t.pick(batch, 'name'),
        batch_type: batch.batch_type,
        branch_id: batch.branch_id,
        capacity: batch.capacity,
        fee: batch.fee,
        seatsLeft,
        full: Boolean(batch.capacity && taken >= batch.capacity),
      };
    }),
  }));

  const number = (value: string | undefined) => (/^\d+$/.test(value ?? '') ? Number(value) : undefined);

  return (
    <>
      <SiteHeader />
      <PageHeader
        title={t.t('enroll.heading')}
        subtitle={t.t('enroll.subheading')}
        breadcrumb={[{ href: '/', label: t.t('nav.home') }, { label: t.t('enroll.page_title') }]}
      />

      <PageBody>
        {courses.length === 0 ? (
          <Card>
            <CardHeader title={t.t('enroll.no_courses')} icon="bi-journal-x" />
            <CardBody>
              <p className="text-ink-muted">
                {t.t('enroll.no_courses_help', {
                  phone: helpline !== '' ? ` — ${formatPhone(helpline)}` : '',
                })}
              </p>
              {helpline !== '' && (
                <a
                  href={telHref(helpline)}
                  className="mt-3 inline-flex items-center gap-2 font-medium text-primary hover:underline"
                >
                  <i className="bi bi-telephone-fill" aria-hidden />
                  {formatPhone(helpline)}
                </a>
              )}
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
            <div className="min-w-0">
              <ApplyForm
                courses={courses}
                branches={form.branches.map((branch) => ({
                  id: branch.id,
                  name: t.pickPair(branch, 'name'),
                }))}
                payment={{
                  on: form.paymentOn,
                  allowPayLater: form.allowPayLater,
                  bkash: form.bkash,
                  nagad: form.nagad,
                  instructions: form.instructions,
                }}
                signedInAs={signedInAs}
                defaultCourseId={number(params.course)}
                defaultBatchId={number(params.batch)}
                defaultBranchId={number(params.branch)}
                labels={{
                  stepCourse: t.t('enroll.step_course'),
                  stepDetails: t.t('enroll.step_details'),
                  stepPayment: t.t('enroll.step_payment'),
                  chooseCourseHelp: t.t('enroll.choose_course_help'),
                  branchTitle: t.t('enroll.branch_title'),
                  branchHelp: t.t('enroll.branch_help'),
                  branchFirst: t.t('enroll.branch_first'),
                  branchNoBatches: t.t('enroll.branch_no_batches'),
                  noCourses: t.t('enroll.no_courses'),
                  typeOnline: t.t('course.type_online'),
                  typeOffline: t.t('course.type_offline'),
                  batchFull: t.t('enroll.batch_full'),
                  seatsLeft: t.t('enroll.seats_left'),
                  requiredNote: t.t('enroll.required_note'),
                  secStudent: t.t('enroll.sec_student'),
                  secContact: t.t('enroll.sec_contact'),
                  secGuardian: t.t('enroll.sec_guardian'),
                  secAcademic: t.t('enroll.sec_academic'),
                  fullname: t.t('enroll.f_fullname'),
                  fullnameBn: t.t('enroll.f_fullname_bn'),
                  fullnameBnHelp: t.t('enroll.f_fullname_bn_help'),
                  dob: t.t('enroll.f_dob'),
                  gender: t.t('enroll.f_gender'),
                  genderNone: t.t('enroll.gender_none'),
                  genderMale: t.t('enroll.gender_male'),
                  genderFemale: t.t('enroll.gender_female'),
                  genderOther: t.t('enroll.gender_other'),
                  photo: t.t('common.photo'),
                  photoHelp: t.t('enroll.f_photo_help'),
                  studentId: t.t('enroll.f_student_id'),
                  studentIdLocked: t.t('enroll.student_id_locked'),
                  existingStudentHelp: t.t('enroll.existing_student_help'),
                  mobile: t.t('enroll.f_mobile'),
                  mobileHelp: t.t('enroll.f_mobile_help'),
                  email: t.t('auth.email'),
                  emailHelp: t.t('enroll.f_email_help'),
                  address: t.t('common.address'),
                  father: t.t('enroll.f_father'),
                  mother: t.t('enroll.f_mother'),
                  guardianPhone: t.t('enroll.f_guardian_phone'),
                  institution: t.t('enroll.f_institution'),
                  className: t.t('enroll.f_class'),
                  classPlaceholder: t.t('enroll.f_class_ph'),
                  message: t.t('enroll.f_message'),
                  paymentHelp: t.t('enroll.payment_help'),
                  paymentUnavailable: t.t('enroll.payment_unavailable'),
                  howToPay: t.t('enroll.how_to_pay'),
                  bkash: t.t('enroll.bkash'),
                  nagad: t.t('enroll.nagad'),
                  sendMoneyBkash: t.t('enroll.send_money_bkash'),
                  sendMoneyNagad: t.t('enroll.send_money_nagad'),
                  amountDue: t.t('enroll.amount_due'),
                  method: t.t('enroll.f_method'),
                  methodLater: t.t('enroll.method_later'),
                  trx: t.t('enroll.f_trx'),
                  trxHelp: t.t('enroll.f_trx_help'),
                  sender: t.t('enroll.f_sender'),
                  senderHelp: t.t('enroll.f_sender_help'),
                  amount: t.t('enroll.f_amount'),
                  screenshot: t.t('enroll.f_screenshot'),
                  screenshotHelp: t.t('enroll.f_screenshot_help'),
                  secureNote: t.t('enroll.secure_note'),
                  confirm: t.t('enroll.confirm'),
                  submit: t.t('enroll.submit'),
                  submitting: t.t('enroll.submitting'),
                  signedInAs: t.t('enroll.signed_in_as'),
                  successTitle: t.t('enroll.success_title'),
                  successText: t.t('enroll.success_text'),
                  appNo: t.t('enroll.app_no'),
                  appNoHelp: t.t('enroll.app_no_help'),
                  statusPendingPaid: t.t('enroll.status_pending_paid'),
                  statusPendingUnpaid: t.t('enroll.status_pending_unpaid'),
                  checkStatus: t.t('enroll.check_status'),
                  backHome: t.t('enroll.back_home'),
                }}
              />
            </div>

            <aside className="space-y-6">
              <Card>
                <CardHeader title={t.t('enroll.next_title')} icon="bi-signpost-split" />
                <CardBody>
                  <ol className="space-y-3 text-sm text-ink-muted">
                    {[1, 2, 3].map((n) => (
                      <li key={n} className="flex gap-2">
                        <span aria-hidden className="text-primary">{t.digits(n)}.</span>
                        {t.t(`enroll.next${n}`)}
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>

              {helpline !== '' && (
                <Alert tone="info" icon="bi-headset">
                  <a href={telHref(helpline)} className="font-medium hover:underline">
                    {formatPhone(helpline)}
                  </a>
                </Alert>
              )}
            </aside>
          </div>
        )}
      </PageBody>
    </>
  );
}
