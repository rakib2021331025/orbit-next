import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403 } from '@/lib/security/api';
import { prisma } from '@/lib/db/prisma';
import { getLang, translate } from '@/lib/i18n';
import { csvHeaders, makeCsv } from '@/lib/export/xlsx';
import { csvSafe, pick, studentCode, validText, ymd } from '@/lib/reports/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every student record as CSV, from admin/export_csv.php.
 *
 * Deliberately unfiltered by course or batch — that is what Reports → Student
 * list is for. This is the "give me everything, pending registrations
 * included" export that the office has always had.
 *
 * The stored photo path is **not** exported, only whether a photo is on file:
 * a path in a spreadsheet is an invitation to guess at neighbouring ones.
 */
export async function GET(request: NextRequest) {
  // Super admins only: admin/export_csv.php is not on orbit_branch_admin_allowed_scripts(),
  // and this export is not narrowed by branch.
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;
  const lang = await getLang();
  const t = (key: string) => translate(lang, key);

  const params = request.nextUrl.searchParams;
  const status = pick(params.get('status'), ['pending', 'approved'] as const);
  const search = validText(params.get('search'));

  const where: Record<string, unknown> = {};
  if (status !== '') where.status = status;
  if (search !== '') {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { name_bn: { contains: search, mode: 'insensitive' } },
      { student_id_no: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ];
  }

  const students = await prisma.student
    .findMany({
      where,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        student_id_no: true,
        name: true,
        name_bn: true,
        phone: true,
        email: true,
        institution: true,
        address: true,
        course: true,
        batch: true,
        image: true,
        status: true,
        student_status: true,
        created_at: true,
      },
    })
    .catch(() => null);

  if (students === null) {
    return NextResponse.json({ error: t('arep.export_failed') }, { status: 500 });
  }

  const header = [
    t('arep.col_record_id'),
    t('common.student_id'),
    t('common.name'),
    t('arep.col_name_bn'),
    t('common.phone'),
    t('common.email'),
    t('arep.col_institution'),
    t('common.address'),
    t('common.course'),
    t('common.batch'),
    t('arep.col_registration'),
    t('common.status'),
    t('arep.col_photo'),
    t('arep.col_joined'),
  ].map(csvSafe);

  const lines = students.map((student) => [
    String(student.id),
    csvSafe(studentCode(student.student_id_no, student.id)),
    csvSafe(student.name),
    csvSafe(student.name_bn ?? ''),
    csvSafe(student.phone ?? ''),
    csvSafe(student.email ?? ''),
    csvSafe(student.institution ?? ''),
    csvSafe(student.address ?? ''),
    csvSafe(student.course ?? ''),
    csvSafe(student.batch ?? ''),
    t(student.status === 'approved' ? 'status.approved' : 'status.pending'),
    t(student.student_status === 'Inactive' ? 'status.inactive' : 'status.active'),
    t((student.image ?? '').trim() !== '' ? 'common.yes' : 'common.no'),
    ymd(student.created_at) ?? '',
  ]);

  const bytes = makeCsv([header, ...lines]);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

  return new NextResponse(new Uint8Array(bytes), {
    headers: csvHeaders(`student_records_${stamp}.csv`, bytes.length),
  });
}
