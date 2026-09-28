/**
 * Load test for orbit-next — k6 (https://k6.io).
 *
 *   k6 run -e BASE=https://<preview>.vercel.app \
 *          -e STUDENT_COOKIE='orbit_session=…' -e ADMIN_COOKIE='orbit_session=…' \
 *          -e STAGE=100 tools/loadtest/k6.js
 *
 * STAGE is the peak number of virtual users: run 100, then 500, then 1000, and
 * stop raising it at the first stage whose thresholds fail. Session cookies come
 * from a real sign-in in a browser (DevTools → Application → Cookies), for demo
 * accounts only — never a real student's.
 *
 * Run it against a PREVIEW deployment with its own Neon branch, never production:
 * the portal scenarios read real rows, and 1000 users of synthetic traffic would
 * also skew the visitor analytics.
 *
 * The traffic mix mirrors a school day: most hits are public pages and student
 * portal views; admins are few but heavy.
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:3000';
const PEAK = Number(__ENV.STAGE || 100);
const STUDENT = __ENV.STUDENT_COOKIE || '';
const ADMIN = __ENV.ADMIN_COOKIE || '';

export const options = {
  scenarios: {
    visitors: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: Math.round(PEAK * 0.6) },
        { duration: '3m', target: Math.round(PEAK * 0.6) },
        { duration: '1m', target: 0 },
      ],
      exec: 'visitor',
    },
    students: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: Math.round(PEAK * 0.35) },
        { duration: '3m', target: Math.round(PEAK * 0.35) },
        { duration: '1m', target: 0 },
      ],
      exec: 'student',
    },
    admins: {
      executor: 'constant-vus',
      vus: Math.max(1, Math.round(PEAK * 0.05)),
      duration: '5m',
      exec: 'admin',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:public}': ['p(95)<800', 'p(99)<2000'],
    'http_req_duration{kind:portal}': ['p(95)<1500', 'p(99)<3000'],
    'http_req_duration{kind:pdf}': ['p(95)<4000'],
  },
};

const pdfTime = new Trend('pdf_duration', true);
const redirectedToLogin = new Rate('redirected_to_login');

function get(path, kind, cookie) {
  const res = http.get(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirects: 0,
    tags: { kind, name: path.split('?')[0] },
  });
  check(res, { [`${path} ok`]: (r) => r.status === 200 || r.status === 307 });
  if (kind === 'portal') redirectedToLogin.add(res.status === 307);
  return res;
}

export function visitor() {
  group('public', () => {
    get('/', 'public');
    sleep(2 + Math.random() * 3);
    get(['/courses', '/notices', '/gallery', '/branches'][Math.floor(Math.random() * 4)], 'public');
    sleep(2 + Math.random() * 3);
    get('/student/login', 'public');
  });
  sleep(3);
}

export function student() {
  if (!STUDENT) return sleep(5);
  group('student portal', () => {
    get('/student', 'portal', STUDENT);
    sleep(3);
    get('/student/attendance', 'portal', STUDENT);
    sleep(3);
    get('/student/results', 'portal', STUDENT);
    sleep(3);
    get('/student/notices', 'portal', STUDENT);
    sleep(3);
    get('/student/payments', 'portal', STUDENT);
    if (Math.random() < 0.1) {
      const res = get('/api/id-card', 'pdf', STUDENT);
      pdfTime.add(res.timings.duration);
    }
  });
  sleep(5);
}

export function admin() {
  if (!ADMIN) return sleep(5);
  group('admin', () => {
    get('/admin', 'portal', ADMIN);
    sleep(5);
    get('/admin/students', 'portal', ADMIN);
    sleep(5);
    get('/admin/payment-tracking', 'portal', ADMIN);
    sleep(5);
    get('/admin/attendance', 'portal', ADMIN);
  });
  sleep(10);
}
