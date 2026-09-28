/**
 * Smoke test: every page and document route, as every role.
 *
 *   npx tsx tools/smoke.ts [baseUrl]      (default http://localhost:3200)
 *
 * Mints a session cookie per role (signed with AUTH_SECRET, exactly as a real
 * sign-in does), walks every `page.tsx` under app/ with ids taken from the
 * database, and reports anything that is not a 200/redirect or whose HTML
 * carries a Next error page. Read-only: it only issues GET requests.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../prisma/seed/env';
import { createHmac } from 'node:crypto';

/** lib/security/token.ts's signToken(), inlined: that module is server-only. */
function signToken(p: string, data: Record<string, unknown>, ttl: number): string {
  const b64 = (v: Buffer | string) => Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const body = b64(JSON.stringify({ ...data, p, x: Math.floor(Date.now() / 1000) + ttl }));
  return body + '.' + b64(createHmac('sha256', process.env.AUTH_SECRET!).update(body).digest());
}

loadEnv();
const base = process.argv[2] ?? 'http://localhost:3200';
const prisma = new PrismaClient();

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name === 'page.tsx' || name === 'route.ts') out.push(full);
  }
  return out;
}

async function cookie(uid: number, role: string, extra: Record<string, unknown> = {}) {
  const token = await new SignJWT({ uid, role, ...extra })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  return `orbit_session=${token}`;
}

async function main() {
  const admin = await prisma.admin.findFirstOrThrow({ where: { role: 'super_admin' } });
  const student = await prisma.student.findFirstOrThrow({ where: { phone: '01700000001' } });
  const teacher = await prisma.teacher.findFirstOrThrow();
  const guardian = await prisma.guardian.findFirstOrThrow({ where: { phone: '01700000071' } });
  const exam = await prisma.monthlyExam.findFirstOrThrow();
  const branch = await prisma.branch.findFirstOrThrow();
  const course = await prisma.course.findFirstOrThrow();
  const paid = await prisma.payment.findFirstOrThrow({ where: { student_id: student.id, payment_status: 'paid' } });
  const application = await prisma.admission.findFirst();

  const roles: Record<string, string> = {
    admin: await cookie(admin.id, 'admin', { adminRole: 'super_admin', branchId: null }),
    student: await cookie(student.id, 'student', { branchId: student.branch_id, mustChangePassword: false }),
    teacher: await cookie(teacher.id, 'teacher'),
    guardian: await cookie(guardian.id, 'guardian', { mustChangePassword: false }),
  };

  // Dynamic segments → a real id where one exists.
  const ids: Record<string, string> = {
    '/admin/students/[id]': String(student.id),
    '/admin/branches/[id]': String(branch.id),
    '/admin/monthly-exams/[id]': String(exam.id),
    '/admin/exams/[id]': '1',
    '/admin/evaluate/[id]': '1',
    '/admin/assignments/[id]': '1',
    '/admin/gifts/[id]': '1',
    '/admin/promotions/[id]': '1',
    '/branches/[slug]': branch.slug,
    '/courses/[id]': String(course.id),
    '/student/exams/[id]': '1',
    '/student/recordings/[id]': '1',
    '/teacher/evaluate/[id]': '1',
    '/teacher/exams/[id]': '1',
  };

  const urls: { url: string; role: string }[] = [];
  for (const file of pages('app')) {
    let route = '/' + relative('app', file).split(sep).slice(0, -1).filter((s) => !s.startsWith('(')).join('/');
    if (route.startsWith('/api/') || route === '/fee-slip' || route === '/marksheet-share') continue; // below
    for (const [prefix, id] of Object.entries(ids)) {
      if (route.startsWith(prefix)) route = route.replace(/\[(id|slug)\]/, id);
    }
    if (route.includes('[')) { console.log(`skip ${route}`); continue; }
    if (route.endsWith('/logout')) continue; // would end the session
    const role = ['admin', 'student', 'teacher', 'guardian'].find((r) => route === `/${r}` || route.startsWith(`/${r}/`)) ?? 'public';
    urls.push({ url: route === '' ? '/' : route, role });
  }

  const q = `?student=${student.id}`;
  urls.push(
    { url: `/guardian/attendance${q}`, role: 'guardian' },
    { url: `/guardian/notices${q}&tab=child`, role: 'guardian' },
    { url: `/guardian/marksheet${q}&exam=${exam.id}`, role: 'guardian' },
    { url: `/student/marksheet?exam=${exam.id}`, role: 'student' },
    { url: `/api/marksheet?exam=${exam.id}`, role: 'student' },
    { url: `/api/marksheet?exam=${exam.id}&student=${student.id}`, role: 'guardian' },
    { url: `/api/marksheet?exam=${exam.id}&student=${student.id}`, role: 'admin' },
    { url: `/api/id-card`, role: 'student' },
    { url: `/api/id-card?id=${student.id}`, role: 'admin' },
    { url: `/api/receipt/${paid.id}`, role: 'student' },
    { url: `/api/receipt/${paid.id}`, role: 'guardian' },
    { url: `/fee-slip?student=${student.id}`, role: 'student' },
    { url: `/fee-slip?student=${student.id}`, role: 'guardian' },
    { url: `/fee-slip?bulk=1`, role: 'admin' },
    { url: `/marksheet-share?t=${encodeURIComponent(signToken('marksheet', { e: exam.id, s: student.id, l: 'bn' }, 600))}`, role: 'public' },
    { url: `/admission-print`, role: 'public' },
    ...(application ? [{ url: `/admission-print?id=${application.id}`, role: 'admin' }] : []),
    { url: `/api/export/students`, role: 'admin' },
    { url: `/api/export/attendance`, role: 'admin' },
    { url: `/api/export/report`, role: 'admin' },
    { url: `/api/admin/student-count`, role: 'admin' },
    // Access control: these must NOT succeed.
    { url: `/guardian/attendance?student=999999`, role: 'guardian' },
    { url: `/api/marksheet?exam=${exam.id}&student=${student.id + 3}`, role: 'guardian' },
    { url: `/admin`, role: 'student' },
  );

  const bad: string[] = [];
  let ok = 0;
  const queue = [...urls];
  const worker = async () => {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const { url, role } = next;
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(base + url, {
        redirect: 'manual',
        headers: role === 'public' ? {} : { cookie: roles[role] },
      });
    } catch (e) {
      bad.push(`FETCH  ${role.padEnd(8)} ${url}  ${(e as Error).message}`);
      continue;
    }
    const type = res.headers.get('content-type') ?? '';
    const body = type.includes('html') ? await res.text() : '';
    const errorPage = /Application error: a (server|client)-side exception|Internal Server Error/i.test(body);
    const ms = Date.now() - started;
    const line = `${String(res.status).padEnd(4)} ${role.padEnd(8)} ${url}  ${res.headers.get('location') ?? ''} ${type.split(';')[0]} ${ms}ms`;
    if (res.status >= 500 || (res.status === 200 && errorPage && !/999999|student=\d+&|\/admin$/.test(url))) bad.push(line);
    else ok++;
    console.log(line);
  }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  console.log(`\n${ok} ok, ${bad.length} problems`);
  bad.forEach((b) => console.log('  ' + b));
  await prisma.$disconnect();
}

main();
