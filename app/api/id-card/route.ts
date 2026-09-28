import { NextResponse, type NextRequest } from 'next/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { currentUser, requireAdmin, branchWhere } from '@/lib/auth/guards';
import { getLang, isLang, translate, type Lang } from '@/lib/i18n';
import { settingFlag } from '@/lib/settings';
import { buildCards, cardInstitute, displayId, idCardPdf } from '@/lib/pdf/idcard';
import { pdfHeaders } from '@/lib/pdf/doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Student ID cards as a PDF, from admin/student_id_card.php.
 *
 *   /api/id-card?id=<student>        one card
 *   /api/id-card?ids=1,2,3           several
 *   /api/id-card?batch=<batch>       a whole batch
 *   &lang=bn|en                      the card's language
 *
 * An admin may print anybody's. A **student may print only their own**, and only
 * while the institute allows it — `student_id_card_download` is a setting, and
 * turning it off means cards are collected from the office.
 *
 * Opening a card **issues** it: a missing Student ID is assigned and the issue
 * and validity dates are recorded, which is why only these two roles reach it.
 *
 * A **branch admin** gets only their own branch's students (and shared ones),
 * whatever ids or batch the URL names — the students list links here, so the
 * route narrows rather than refuses. The list is capped so one request cannot
 * ask for a PDF of the whole institute.
 */

/** More cards than any batch holds; a longer list is a mistake or an attack. */
const MAX_CARDS = 500;
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const user = await currentUser();
  if (!user) notFound();

  let ids: number[] = [];

  if (user.role === 'student') {
    // Their own card, and only if the institute offers the download.
    if (!(await settingFlag('student_id_card_download', true))) notFound();
    // student/id_card.php shows a card only once the office has issued a
    // Student ID, and records nothing — issuing is the office's act.
    const own = await prisma.student
      .findUnique({ where: { id: user.uid }, select: { student_id_no: true } })
      .catch(() => null);
    if (!own || (own.student_id_no ?? '').trim() === '') notFound();
    ids = [user.uid];
  } else if (user.role === 'admin') {
    await requireAdmin();

    const batch = /^\d+$/.test(params.get('batch') ?? '') ? Number(params.get('batch')) : 0;
    const single = /^\d+$/.test(params.get('id') ?? '') ? Number(params.get('id')) : 0;
    const list = [
      ...new Set(
        (params.get('ids') ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter((value) => /^\d{1,10}$/.test(value))
          .map(Number)
          .filter((value) => value > 0)
      ),
    ].slice(0, MAX_CARDS);

    if (list.length > 0) {
      ids = list;
    } else if (batch > 0) {
      // Students placed in the batch on their record or through an active
      // enrolment — the same two ways every other page reads a batch.
      const rows = await prisma.student
        .findMany({
          where: {
            status: 'approved',
            OR: [
              { batch_id: batch },
              { enrollment_student: { some: { status: 'active', batch_id: batch } } },
            ],
          },
          select: { id: true },
        })
        .catch(() => []);
      ids = rows.map((row) => row.id);
    } else if (single > 0) {
      ids = [single];
    }

    // Branch scope: keep only the students this admin may see. An all-branch
    // admin's filter is empty and this is a no-op beyond the cap.
    const scope = await branchWhere();
    if (ids.length > 0 && Object.keys(scope).length > 0) {
      const allowed = await prisma.student
        .findMany({ where: { AND: [{ id: { in: ids } }, scope] }, select: { id: true } })
        .catch(() => []);
      const keep = new Set(allowed.map((row) => row.id));
      ids = ids.filter((id) => keep.has(id));
    }
    ids = ids.slice(0, MAX_CARDS);
  } else {
    notFound();
  }

  const asked = params.get('lang');
  const lang: Lang = isLang(asked) ? asked : await getLang();

  if (ids.length === 0) {
    return NextResponse.json(
      { error: translate(lang, 'idc.title'), detail: translate(lang, 'idc.no_students') },
      { status: 400 }
    );
  }

  const [cards, institute] = await Promise.all([
    // Only an admin's print issues cards (assigns IDs, stamps dates).
    buildCards(ids, user.role === 'admin', lang),
    cardInstitute(lang),
  ]);

  if (cards.length === 0) {
    return NextResponse.json(
      { error: translate(lang, 'idc.title'), detail: translate(lang, 'idc.not_found') },
      { status: 404 }
    );
  }

  const bytes = await idCardPdf(cards, institute, lang);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name =
    cards.length === 1
      ? `ID-Card-${displayId(cards[0].student)}.pdf`
      : `ID-Cards-${cards.length}-${stamp}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: pdfHeaders(
      name,
      bytes.length,
      user.role === 'student' && params.get('format') !== 'pdf' ? 'inline' : 'download'
    ),
  });
}
