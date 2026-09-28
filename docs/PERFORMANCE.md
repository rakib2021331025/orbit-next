# Production architecture: storage, caching, database, load testing

```
Browser ──► Vercel (Next.js) ──► Neon PostgreSQL (pooled)   structured data + file PATHS
   │                 │
   │                 └─────────► Supabase Storage            the files themselves
   └──────── public images ─────► Supabase CDN (direct, no Next.js hop)
```

## 1. Files — Supabase Storage, never PostgreSQL

The database keeps only the path the PHP app wrote (`uploads/materials/ab12.pdf`).
`lib/storage/buckets.ts` maps the folder to a bucket; the object key is the path
without `uploads/`. No bucket column, no stored URL, no signed link in any row.

| Bucket | Access | Folders | Cache-Control on objects |
|---|---|---|---|
| `public-images` | public | branding, director, developer, courses, branches, teachers, achievements, gifts, promotions, trial-classes | 1 year, immutable |
| `gallery` | public | gallery (incl. covers) | 1 year, immutable |
| `documents` | private | materials, notes, printables, assignments, live_classes, exams | 1 hour, private |
| `student-files` | private | students, applicants, submissions, exam_answers, ai, legacy root photos | 1 hour, private |
| `payment-slips` | private | payments | 1 hour, private |

Filenames are random and never reused (`uniqueFilename()`), so a public URL's
bytes never change — which is what makes a one-year immutable cache safe.
Uploads are never upserted.

**How a file reaches the browser**

| Kind | Path |
|---|---|
| Public image | `uploadUrl()` returns the Storage CDN URL; the browser fetches it directly. |
| Private file by path (materials, notes, exam/assignment files) | `/api/files/<bucket>/<key>` — session check (and ownership for student files) → 302 to a 1-hour signed URL. |
| Private file by record (student photo, applicant photo, payment slip, AI image, printable) | `/api/media/<type>/<id>` — the existing per-record authorisation → 302 to a signed URL. |

Signed URLs are reused per server instance while they have > 15 minutes left
(`signedUrl()` in `lib/storage/store.ts`), and the 302 is cached privately in the
browser for 10 minutes. The service-role key is read only in
`lib/storage/supabase.ts`, server-side.

**Setup**

```bash
# .env: ORBIT_STORAGE="supabase", NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npx tsx tools/storage-setup.ts --dry-run                               # what it would do
npx tsx tools/storage-setup.ts                                         # create/align the 5 buckets
npx tsx tools/storage-setup.ts --upload D:/xampp/htdocs/Orbit/uploads  # copy legacy files (read-only on the source)
```

## 2. Caching

Every page renders dynamically (language and theme come from cookies), so the
cache is at the DATA layer: `lib/cache` wraps `unstable_cache` with tags and
encodes Dates/Decimals so they survive the JSON round trip.

| Data | Tag | Revalidate | Dropped by |
|---|---|---|---|
| Site settings | `site-settings` | 1 h | Settings save (`lib/settings/save.ts`) |
| Courses (+ batches) | `courses` | 10 min | courses, batches, branches actions |
| Branches, branch detail, counts | `branches` | 1 h / 10 min | branches, batches actions |
| Public notices (unsearched pages) | `notices` | 5 min | notices actions |
| Gallery, categories | `gallery` | 10 min / 1 h | gallery, gallery-categories actions |
| Teachers on the website | `teachers` | 1 h | teachers actions |
| Home sections, promotions, gifts, stats, trial classes | `home-content` | 5–60 min | achievements, gifts, promotions, trial-classes, gallery, review moderation, monthly exams |
| Published exam list (results page) | `published-exams` | 10 min | monthly-exams actions |
| Upcoming online classes | `public-classes` | 5 min | admin and teacher live-class actions |

**Never cached in the shared cache:** anything behind a login — a student's
marks, attendance, payments, a guardian's children, admin lists. Portal routes
also send `Cache-Control: no-store`. Searches are not cached (unbounded keys).

## 3. Database

- One PrismaClient per process (`lib/db/prisma.ts`), `server-only`.
- `DATABASE_URL` = Neon **pooled** endpoint, `connection_limit=5&pool_timeout=15` (no `pgbouncer=true`: Neon's pooler supports prepared statements, and the flag quadruples round trips).
  `DIRECT_URL` = direct endpoint, used only by `prisma migrate`.
- Slow-query log: `ORBIT_SLOW_QUERY_MS` (default 500 ms in development, off in
  production unless set). SQL text and duration only — never parameters.
- Indexes and defaults: see `docs/SCHEMA_AUDIT.md` and migration
  `20260926100000_indexes_defaults`. Before adding another index, run the slow
  query through `EXPLAIN ANALYZE` on a Neon branch.
- Visitor analytics are written with `after()`, after the response is sent.

## 4. Load testing

`tools/loadtest/k6.js` — mix of 60 % public visitors, 35 % students, 5 % admins,
ramping to `STAGE` users. Run at 100, then 500, then 1000, against a **preview
deployment with its own Neon branch**, never production.

Measure per stage: requests/s, p50/p95/p99 per kind (public / portal / pdf),
error rate, and from Neon's dashboard: active connections, CPU, query count;
from Vercel: function duration, cold starts; Supabase: bandwidth and cache hits
(`cf-cache-status` on public objects).

Thresholds in the script: < 1 % errors; public p95 < 800 ms; portal p95 < 1.5 s;
PDF p95 < 4 s. **No capacity figure is claimed until a stage passes on the real
deployment.**
