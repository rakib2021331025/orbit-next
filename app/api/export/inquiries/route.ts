import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403 } from '@/lib/security/api';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { pickLocalized } from '@/lib/i18n/format';
import { csvHeaders, makeCsv } from '@/lib/export/xlsx';
import { csvSafe, ymd } from '@/lib/reports/core';
import { inquiryExport, inquiryFilters } from '@/lib/inquiries/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The inquiry list as CSV, from the `?export=csv` branch of
 * admin/inquiries.php.
 *
 * It exports **the filter the page is showing**, capped at 10,000 rows, so
 * what somebody downloads is what they were looking at.
 */
export async function GET(request: NextRequest) {
  // A branch admin gets a 403, not the 500 an uncaught ForbiddenError becomes.
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;
  const lang = await getLang();
  const t = (key: string) => translate(lang, key);

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = inquiryFilters(params);

  const rows = await inquiryExport(filters);

  const courses = await prisma.course
    .findMany({ select: { id: true, name: true, name_bn: true } })
    .catch(() => []);
  const courseById = new Map(courses.map((course) => [course.id, course]));

  const header = [
    'ID',
    t('ainq.col_received'),
    t('common.name'),
    t('common.phone'),
    t('common.course'),
    t('inquiry.f_time'),
    t('inquiry.f_message'),
    t('ainq.source'),
    t('common.status'),
    t('ainq.follow_up'),
    t('ainq.called_at'),
    t('ainq.admitted_at'),
    t('ainq.note'),
    t('ainq.lang'),
  ].map(csvSafe);

  const lines = rows.map((row) => {
    const course =
      row.course_id && courseById.has(row.course_id)
        ? pickLocalized(courseById.get(row.course_id)!, 'name', lang)
        : (row.course_name ?? '');

    return [
      String(row.id),
      row.created_at.toISOString().slice(0, 19).replace('T', ' '),
      csvSafe(row.name),
      csvSafe(row.phone),
      csvSafe(course),
      row.preferred_time ? t(`inquiry.time_${row.preferred_time}`) : '',
      csvSafe(row.message ?? ''),
      t(`inquiry.source_${row.source}`),
      t(`inquiry.status_${row.status}`),
      ymd(row.follow_up_date) ?? '',
      row.called_at ? row.called_at.toISOString().slice(0, 19).replace('T', ' ') : '',
      row.admitted_at ? row.admitted_at.toISOString().slice(0, 19).replace('T', ' ') : '',
      csvSafe(row.admin_note ?? ''),
      row.lang ?? '',
    ];
  });

  const bytes = makeCsv([header, ...lines]);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  return new NextResponse(new Uint8Array(bytes), {
    headers: csvHeaders(`inquiries-${filters.status}-${stamp}.csv`, bytes.length),
  });
}
