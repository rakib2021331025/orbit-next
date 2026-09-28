import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody } from '@/components/ui/Card';
import { prisma } from '@/lib/db/prisma';
import { setting } from '@/lib/settings';
import { uploadUrl } from '@/lib/storage/url';
import { branchForEdit } from '@/lib/branch/manage';
import { BranchForm } from './BranchForms';

/** The branch form, shared by "new" and "edit". */
export async function BranchFormPage({ branchId }: { branchId: number }) {
  return (
    <AdminPage active="branches" route="/admin/branches" level="super" title="">
      {async ({ t }) => {
        const loaded = branchId > 0 ? await branchForEdit(branchId) : null;
        if (branchId > 0 && loaded === null) notFound();

        const [courses, teachers, siteUrl] = await Promise.all([
          prisma.course
            .findMany({
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, name_bn: true },
            })
            .catch(() => []),
          prisma.teacher
            .findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
            .catch(() => []),
          setting('site_url', ''),
        ]);

        const branch = loaded?.branch ?? null;

        return (
          <div className="space-y-6">
            <div>
              <Link href="/admin/branches" className="text-sm text-primary hover:underline">
                <i className="bi bi-arrow-left me-1" aria-hidden /> {t.t('abr.title')}
              </Link>
              <h1 className="mt-1 text-2xl font-bold text-ink-heading">
                {t.t(branch ? 'abr.edit' : 'abr.new')}
              </h1>
            </div>

            <Card>
              <CardBody>
                <BranchForm
                  values={{
                    id: branch?.id ?? 0,
                    nameBn: branch?.name_bn ?? '',
                    nameEn: branch?.name_en ?? '',
                    slug: branch?.slug ?? '',
                    addressBn: branch?.address_bn ?? '',
                    addressEn: branch?.address_en ?? '',
                    descriptionBn: branch?.description_bn ?? '',
                    descriptionEn: branch?.description_en ?? '',
                    phone: branch?.phone ?? '',
                    email: branch?.email ?? '',
                    mapUrl: branch?.map_url ?? '',
                    sortOrder: branch?.sort_order ?? 0,
                    status: branch?.status ?? 'active',
                    isMain: branch?.is_main ?? false,
                    imageUrl: branch?.image ? uploadUrl(branch.image) : '',
                  }}
                  courses={courses.map((course) => ({
                    id: course.id,
                    label: t.pick(course, 'name'),
                  }))}
                  teachers={teachers.map((teacher) => ({
                    id: teacher.id,
                    label: teacher.name,
                  }))}
                  courseIds={loaded?.courseIds ?? []}
                  teacherIds={loaded?.teacherIds ?? []}
                  siteUrl={siteUrl.replace(/\/+$/, '')}
                  labels={{
                    nameBn: t.t('abr.name_bn'),
                    nameEn: t.t('abr.name_en'),
                    slug: t.t('abr.slug'),
                    slugHelp: t.t('abr.slug_help', { url: '{url}' }),
                    addressBn: t.t('abr.address_bn'),
                    addressEn: t.t('abr.address_en'),
                    descriptionBn: t.t('abr.description_bn'),
                    descriptionEn: t.t('abr.description_en'),
                    descriptionHelp: t.t('abr.description_help'),
                    phone: t.t('abr.phone'),
                    email: t.t('abr.email'),
                    mapUrl: t.t('abr.map_url'),
                    mapHelp: t.t('abr.map_help'),
                    sort: t.t('abr.sort'),
                    status: t.t('abr.status'),
                    statusActive: t.t('status.active'),
                    statusInactive: t.t('status.inactive'),
                    mainInactive: t.t('abr.err_main_inactive'),
                    courses: t.t('abr.courses'),
                    coursesHelp: t.t('abr.courses_help'),
                    noCourses: t.t('abr.no_courses'),
                    teachers: t.t('abr.teachers'),
                    noTeachers: t.t('abr.no_teachers'),
                    image: t.t('abr.image'),
                    imageHelp: t.t('abr.image_help'),
                    removeImage: t.t('abr.remove_image'),
                    save: t.t('common.save'),
                    saving: t.t('common.please_wait'),
                    back: t.t('common.back'),
                    cancel: t.t('common.cancel'),
                  }}
                />
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
