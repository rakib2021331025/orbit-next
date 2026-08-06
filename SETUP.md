# Orbit Private Care — Next.js setup

The rebuild of the legacy PHP/MySQL system, targeting Vercel.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind 4 · shadcn/ui ·
Prisma 7 · Neon Postgres · NextAuth v5 · Vercel Blob · Zod

The legacy PHP app in the parent directory is untouched and still runs. Nothing
is deleted until the new system reaches parity and you decide to cut over.

---

## 1. Provision the database (Neon)

1. Create a project at [neon.tech](https://neon.tech) and a database named `orbit`.
2. Copy **both** connection strings from the dashboard:
   - the **pooled** one (host contains `-pooler`) → `DATABASE_URL`
   - the **direct** one → `DIRECT_URL` (migrations need an unpooled connection)

## 2. Configure environment

```bash
cd orbit-next
cp .env.example .env
```

Fill in `.env`. Generate the auth secret with:

```bash
npx auth secret
```

> Prisma CLI reads `.env`; the Next.js runtime reads `.env` too in development.
> On Vercel, set the same variables in **Project → Settings → Environment Variables**.

### Rotate the leaked credentials first

Two secrets are committed in the legacy source and must be treated as
compromised before go-live:

- the Gmail app password at `../config.php:28`
- the default admin password at `../database_setup.php:50-51`

Revoke the Gmail app password in your Google account, and never reuse the old
admin password for `SEED_ADMIN_PASSWORD`.

## 3. Create the schema

```bash
npm run db:migrate      # development: creates and applies a migration
# or, for a throwaway database:
npm run db:push
```

## 4. Seed the first admin

Set `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` (12+ characters) in
`.env`, then:

```bash
npm run db:seed
```

This creates the admin account plus baseline courses, batches, subjects and
gallery categories. Unlike the legacy `database_setup.php`, it does **not** run
on every request and contains no hardcoded password.

## 5. Connect Vercel Blob

File uploads (gallery images, teacher photos, study materials) go to Vercel
Blob — Vercel's filesystem is ephemeral, so local storage cannot work.

1. Vercel Dashboard → **Storage** → **Blob** → create a store and connect it.
2. `vercel env pull .env.local` — or copy `BLOB_READ_WRITE_TOKEN` into `.env`.

## 6. Migrate the legacy data

Start MySQL in XAMPP first (the migration reads the live `orbit_coaching`
database), then:

```bash
npm run migrate:legacy -- --dry   # report only, writes nothing
npm run migrate:legacy            # for real
```

The script is **idempotent** — every migrated row carries its original MySQL id
in a `legacyId` column and writes go through upsert, so a re-run repairs a
partial migration rather than duplicating data.

### What it does beyond copying rows

| Legacy | Becomes |
|---|---|
| `students.course` / `.batch` (free-text) | real `Course` → `Batch` → `Enrollment` relations |
| `class_routine.teacher_name` (free-text) | real `Teacher` rows |
| `attendance` (student + date only) | `AttendanceSession` (batch + date) with `AttendanceRecord` rows |
| `gallery.category` (hardcoded strings) | real `GalleryCategory` rows |
| `uploads/…`, `images/…` local paths | uploaded to Vercel Blob; only the URL is stored |

### Two things to check afterwards

1. **Teachers imported from `teacher_name` strings have no password** and are
   created inactive. Assign real credentials from **Admin → Teachers** before
   they can sign in.
2. **Attendance loses granularity.** The legacy table had no course, subject or
   teacher column, so imported sessions are grouped only by batch and date, with
   no subject or teacher recorded. Attendance taken in the new system captures
   all three.

Files referenced in the database but missing from disk are reported at the end
and skipped — several such rows exist in the current data.

## 7. Run it

```bash
npm run dev      # http://localhost:3000
```

Sign in at `/login`. You'll be routed to `/admin`, `/teacher` or `/student`
automatically based on your role.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create + apply a migration |
| `npm run db:deploy` | Apply migrations (production/CI) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | Seed admin + reference data |
| `npm run migrate:legacy` | Import from legacy MySQL |

## Architecture notes

**Authorisation is enforced twice, deliberately.** `src/middleware.ts` blocks
whole route prefixes from the JWT (no database round-trip, edge-safe). But
middleware cannot protect Server Actions — those are POST endpoints callable
directly, bypassing any page render. So every action calls a guard from
`src/lib/guards.ts` itself.

**Client/server module split.** `src/lib/prisma.ts`, `guards.ts` and
`storage.ts` are marked `server-only`. Values that client components need —
`ActionState`/`IDLE` and `UPLOAD_LIMITS` — live in `action-result.ts` and
`upload-limits.ts`, which have no server-only imports. Without this split, a
client component importing `IDLE` drags `pg` into the browser bundle and the
build fails on Node built-ins.

**Postgres NULLs are not equal.** A compound unique containing a nullable column
(`@@unique([batchId, date, subjectId])`) does not de-duplicate rows where that
column is NULL. `AttendanceSession.importKey` exists to give the legacy importer
something non-null to upsert against; `assignTeacher` uses `findFirst` rather
than relying on the constraint for the same reason.

**Decimal columns.** Prisma returns `Decimal` objects, not numbers. Everything
that renders money goes through `toNumber`/`formatCurrency` in `src/lib/format.ts`.

## Known trade-offs

- **Next 15 pins vulnerable `postcss` and `sharp` transitives** (3 high-severity
  advisories, `npm audit`). Only Next 16 resolves them, which is a breaking
  upgrade. Next 15 was chosen because it is the better-proven pairing with
  NextAuth v5. Revisit before go-live.
- **shadcn's `form` component fails to install** under the `radix-nova` style.
  Not needed: forms use Server Actions with `useActionState` and Zod validation,
  which is the more idiomatic Next 15 pattern anyway.
