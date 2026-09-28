import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { studentPhotoUrl } from '@/lib/storage/url';
import { helplineNumber } from '@/lib/settings';
import { formatPhone } from '@/lib/site/url';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.profile.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The student's own record, from student/profile.php.
 *
 * Read-only by design: a student cannot edit their own name, roll or course —
 * those appear on an ID card and a marksheet, and the office is the authority on
 * them. The page says how to get a correction made instead of pretending
 * otherwise.
 */
export default async function StudentProfilePage() {
  return (
    <StudentPage
      active="profile"
      title={(t) => t.t('student.profile.title')}
      subtitle={(t) => t.t('student.profile.sub')}
    >
      {async ({ student, t }) => {
        const [full, helpline] = await Promise.all([
          prisma.student
            .findUnique({
              where: { id: student.id },
              select: {
                father_name: true,
                mother_name: true,
                date_of_birth: true,
                gender: true,
                blood_group: true,
                address: true,
                institution: true,
                guardian_phone: true,
                emergency_contact: true,
                roll_number: true,
                created_at: true,
                id_card_valid_until: true,
              },
            })
            .catch(() => null),
          helplineNumber(),
        ]);

        const photo = studentPhotoUrl(student);

        return (
          <div className="space-y-6">
            <Card>
              <CardBody className="flex flex-wrap items-center gap-5">
                {photo !== '' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt=""
                    className="h-24 w-24 rounded-orbit object-cover"
                  />
                ) : (
                  <span className="grid h-24 w-24 place-items-center rounded-orbit bg-primary-soft font-head text-3xl font-semibold text-primary">
                    {t.pick(student, 'name').trim().charAt(0) || '?'}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <h2 className="font-head text-xl font-semibold text-ink-heading">
                    {t.pick(student, 'name')}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {[student.student_id_no, student.course, student.batch]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={student.student_status === 'Active' ? 'success' : 'neutral'}>
                      {t.t(`status.${student.student_status.toLowerCase()}`)}
                    </Badge>
                    {full?.id_card_valid_until && (
                      <Badge tone="info">
                        {t.t('student.profile.valid_until', {
                          date: t.date(full.id_card_valid_until, 'd M Y'),
                        })}
                      </Badge>
                    )}
                  </div>
                </div>

                <ButtonLink href="/student/id-card" variant="secondary" icon="bi-person-vcard">
                  {t.t('idc.title')}
                </ButtonLink>
              </CardBody>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title={t.t('student.profile.personal')} icon="bi-person" />
                <CardBody>
                  <dl className="space-y-3 text-sm">
                    <Row label={t.t('student.profile.name_en')} value={student.name} />
                    <Row label={t.t('student.profile.name_bn')} value={student.name_bn ?? '—'} />
                    <Row label={t.t('student.profile.father')} value={full?.father_name ?? '—'} />
                    <Row label={t.t('student.profile.mother')} value={full?.mother_name ?? '—'} />
                    <Row
                      label={t.t('student.profile.dob')}
                      value={full?.date_of_birth ? t.date(full.date_of_birth, 'd M Y') : '—'}
                    />
                    <Row
                      label={t.t('student.profile.gender')}
                      value={full?.gender ? t.t(`student.profile.gender_${full.gender}`) : '—'}
                    />
                    <Row label={t.t('student.profile.blood')} value={full?.blood_group ?? '—'} />
                  </dl>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t.t('student.profile.contact')} icon="bi-telephone" />
                <CardBody>
                  <dl className="space-y-3 text-sm">
                    <Row label={t.t('enroll.f_mobile')} value={formatPhone(student.phone)} />
                    <Row label={t.t('auth.email')} value={student.email} />
                    <Row
                      label={t.t('student.profile.guardian_phone')}
                      value={full?.guardian_phone ? formatPhone(full.guardian_phone) : '—'}
                    />
                    <Row
                      label={t.t('student.profile.emergency')}
                      value={full?.emergency_contact ? formatPhone(full.emergency_contact) : '—'}
                    />
                    <Row label={t.t('common.address')} value={full?.address ?? '—'} />
                  </dl>
                </CardBody>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader title={t.t('student.profile.academic')} icon="bi-mortarboard" />
                <CardBody>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <Row label={t.t('common.course')} value={student.course} />
                    <Row label={t.t('course.batch')} value={student.batch ?? '—'} />
                    <Row label={t.t('student.profile.roll')} value={full?.roll_number ?? '—'} />
                    <Row
                      label={t.t('student.profile.institution')}
                      value={full?.institution ?? '—'}
                    />
                    <Row
                      label={t.t('student.profile.admitted')}
                      value={full?.created_at ? t.date(full.created_at, 'd M Y') : '—'}
                    />
                    <Row
                      label={t.t('student.profile.status')}
                      value={t.t(`status.${student.student_status.toLowerCase()}`)}
                    />
                  </dl>
                </CardBody>
              </Card>
            </div>

            <Alert tone="info" icon="bi-info-circle">
              {helpline !== ''
                ? t.t('student.profile.correction', { phone: formatPhone(helpline) })
                : t.t('student.profile.correction_plain')}
            </Alert>
          </div>
        );
      }}
    </StudentPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="text-end font-medium text-ink">{value}</dd>
    </div>
  );
}
