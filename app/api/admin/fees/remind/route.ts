import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { guardOr403, sameOrigin, forbidden } from '@/lib/security/api';
import { getTranslator } from '@/lib/i18n';
import { sendReminder, logWhatsapp } from '@/lib/fees/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fee reminders, one chunk at a time — the port of admin/fees_ajax.php.
 *
 * The page sends at most twenty ids per request and this hands back anything it
 * did not get through as `pending`, so the browser can ask again. That is what
 * keeps every request short: a single request for two hundred students is how a
 * send ends up half finished with nobody knowing which half.
 *
 * Super admins only, like the page itself.
 */

/** Stop accepting new work after this long, and return the rest as pending. */
const TIME_BUDGET_MS = 35_000;
const MAX_PER_REQUEST = 20;

export async function POST(request: NextRequest) {
  // Route handlers get no automatic Origin check; this stands in for the
  // csrf_verify() admin/fees_ajax.php calls, since this endpoint sends email.
  if (!sameOrigin(request)) return forbidden();
  const gate = await guardOr403(requireSuperAdmin);
  if (!gate.ok) return gate.response;
  const admin = gate.value;
  const t = await getTranslator();

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? 'remind');

  if (action === 'log_whatsapp') {
    const studentId = /^\d+$/.test(String(body?.student_id ?? '')) ? Number(body.student_id) : 0;
    if (studentId <= 0) return NextResponse.json({ ok: false }, { status: 422 });
    const who = body?.who === 'guardian' ? 'guardian' : 'student';
    const ok = await logWhatsapp(studentId, who, admin.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }

  const ids = [
    ...new Set(
      (Array.isArray(body?.ids) ? body.ids : [])
        .map((value: unknown) => Number(value))
        .filter((id: number) => Number.isInteger(id) && id > 0)
    ),
  ].slice(0, MAX_PER_REQUEST) as number[];

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: t.t('fees.remind_none') }, { status: 422 });
  }

  const force = body?.force === true || body?.force === '1';
  const started = Date.now();
  const results = [];
  let pending: number[] = [];

  for (let index = 0; index < ids.length; index++) {
    // Never bail out before the first one, or a slow mail server would make no
    // progress at all.
    if (index > 0 && Date.now() - started > TIME_BUDGET_MS) {
      pending = ids.slice(index);
      break;
    }
    results.push(await sendReminder(ids[index], force, admin.id));
  }

  return NextResponse.json({ ok: true, results, pending });
}
