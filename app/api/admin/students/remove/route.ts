import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, ForbiddenError } from '@/lib/auth/guards';
import { sameOrigin, forbidden } from '@/lib/security/api';
import { getTranslator } from '@/lib/i18n';
import { removeStudent } from '@/lib/students/remove';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Removing a student record — the port of admin/delete.php.
 *
 * **POST only, and no page links here**, exactly as in the original: the admin
 * pages offer no delete button, because the right action for a student who has
 * left is Inactive. This exists for the one case it was written for — a duplicate
 * entered by mistake, removed deliberately — and it refuses anything with history
 * attached, naming what is linked.
 *
 * A GET deletes nothing. That is the original's first rule, and the reason it is
 * a rule: a bookmarked or prefetched link must never destroy a record.
 */
export async function POST(request: NextRequest) {
  // The csrf_verify() delete.php calls: a route handler gets no Origin check
  // from Next.js, and this one destroys a record.
  if (!sameOrigin(request)) return forbidden();
  await requireAdmin();
  const t = await getTranslator();

  const form = await request.formData().catch(() => null);
  const raw = String(form?.get('id') ?? form?.get('student_id') ?? '');
  const studentId = /^\d+$/.test(raw) ? Number(raw) : 0;

  let outcome;
  try {
    outcome = await removeStudent(studentId);
  } catch (error) {
    // Another branch's student: answered as "not found", so a branch admin
    // cannot probe which ids exist elsewhere.
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: t.t('alg.not_found') }, { status: 404 });
    }
    throw error;
  }

  if (!outcome.ok) {
    const vars: Record<string, string | number> = { ...(outcome.vars ?? {}) };
    if (outcome.links) {
      vars.items = Object.entries(outcome.links)
        .map(([key, count]) => t.t(`alg.rel_${key}`, { count: t.digits(count) }))
        .join(t.t('alg.list_sep'));
    }
    return NextResponse.json(
      { ok: false, error: t.t(outcome.message, vars) },
      // A refusal because of linked records is a conflict, not a server fault.
      { status: outcome.links ? 409 : 400 }
    );
  }

  return NextResponse.json({ ok: true, message: t.t(outcome.message, outcome.vars) });
}

/** A link or a bookmark never deletes. */
export async function GET() {
  await requireAdmin();
  const t = await getTranslator();
  return NextResponse.json({ ok: false, error: t.t('alg.delete_get_blocked') }, { status: 405 });
}
