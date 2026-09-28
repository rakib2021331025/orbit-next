import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403 } from '@/lib/security/api';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * How many approved students are on a course, as JSON — from
 * admin/get_student_count.php.
 *
 * The notes page no longer calls it; it is kept because bookmarks and small
 * scripts still do. `batch` is the course NAME, as the original's parameter
 * name has always been misleading.
 *
 * Super admins only: get_student_count.php is not on the branch-admin
 * allow-list, and an unscoped count would tell a branch admin about other
 * branches' enrolment.
 */
export async function GET(request: NextRequest) {
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;

  const course = (request.nextUrl.searchParams.get('batch') ?? '').trim().slice(0, 255);
  if (course === '') return NextResponse.json({ count: 0 });

  const count = await prisma.student
    .count({ where: { status: 'approved', course } })
    .catch(() => 0);

  return NextResponse.json(
    { count },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
