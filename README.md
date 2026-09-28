# orbit-next

The Next.js + PostgreSQL rebuild of **Orbit Private Care** (অরবিট প্রাইভেট কেয়ার),
the coaching-management system that currently runs as a PHP + MySQL application.

> The original lives in `../Orbit/` and is **not touched** by anything in this
> folder. It stays the running system until this one reaches parity.

---

## Where the migration stands

| | |
|---|---|
| Database schema | **done** — all 65 tables, 726 columns, 61 foreign keys, 62 enums |
| Project, build, deploy pipeline | **done** — `npm run build` and `tsc --noEmit` both pass |
| Environment and secrets | **done** — `.env.example` documents every variable |
| Feature inventory | **done** — [`docs/MIGRATION_INVENTORY.md`](docs/MIGRATION_INVENTORY.md) |
| Pages (155) | **done** — every page migrated or marked n/a in the inventory; not yet parity-tested against live data |
| Data import | **written, not yet run** — `npm run import:mysql -- --dry-run` first (see `docs/DATA_MIGRATION.md`) |

The inventory is generated from the original source, not written from memory:
every page's guard, tables, uploads, PDF, email and branch rules are recorded
there, and each row carries its own status.

---

## 1. Requirements

- **Node.js 20 or newer** (built and tested on 24)
- **PostgreSQL 14 or newer** — a hosted one is easiest: Neon, Supabase or Vercel Postgres
- npm 10+
- For the one-off data import only: read access to the original MySQL database

---

## 2. Installation

```bash
git clone <your-repo-url> orbit-next
cd orbit-next
npm install
cp .env.example .env.local
```

Then fill in `.env.local` — see section 4.

---

## 3. PostgreSQL setup

### Hosted (recommended, and what Vercel expects)

Create a database on Neon, Supabase or Vercel Postgres and copy **both** connection
strings into `.env.local`:

```env
DATABASE_URL="postgresql://…?sslmode=require&connection_limit=5&pool_timeout=15"
DIRECT_URL="postgresql://…?sslmode=require"
```

`DATABASE_URL` goes through the connection pooler — a serverless function that
opened its own pool per request would exhaust the database under load.
`DIRECT_URL` is the unpooled connection, which Prisma Migrate needs because
migrations cannot run through pgbouncer.

### Local

```bash
createdb orbit_dev
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/orbit_dev"
# DIRECT_URL="postgresql://postgres:postgres@localhost:5432/orbit_dev"
```

---

## 4. Environment variables

Every variable is listed in [`.env.example`](.env.example) with a note on what it
is for. The ones without a default must be set before the app will run:

| Variable | Needed for |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Everything |
| `AUTH_SECRET` | Sessions. Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | Absolute links in email and metadata |
| `STORAGE_*` | Photos, payment screenshots, study materials |
| `EMAIL_*` | Password reset, notifications |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Orbit Academic AI |
| `LEGACY_MYSQL_*` | The one-off import only — never set these in Vercel |

**Nothing secret may be prefixed `NEXT_PUBLIC_`.** That prefix compiles the value
into the browser bundle, where every visitor can read it.

---

## 5. Prisma migration

```bash
npm run db:generate      # regenerate the client after a schema change
npm run db:migrate       # create and apply a migration in development
npm run db:deploy        # apply existing migrations (used in production/CI)
npm run db:studio        # browse the data
```

The schema was converted from the original MySQL schema table by table. Field
names keep their database spelling (`student_id_no`, not `studentIdNo`) so every
query in the PHP original can be compared against its replacement line by line;
models are PascalCase and carry `@@map("original_table")`.

---

## 6. Seeding and importing the existing data

```bash
npm run db:seed          # reference data for a fresh development database
npm run import:mysql     # one-off: copy the live MySQL data into PostgreSQL
```

The import is **read-only against MySQL**. It never writes to, alters or drops
anything in the original database, and it is idempotent — running it twice does
not duplicate rows. See [`docs/DATA_MIGRATION.md`](docs/DATA_MIGRATION.md) for the
full procedure, including how to take a backup first and how to verify row counts
afterwards.

---

## 7. Local development

```bash
npm run dev              # http://localhost:3000
npm run typecheck        # tsc --noEmit
npm run lint
```

---

## 8. Build

```bash
npm run build            # prisma generate && next build
npm start
```

The build must finish with no TypeScript errors before anything is deployed.

---

## 9. Deploying to Vercel

1. Push this folder to its own GitHub repository.
2. In Vercel, **New Project → Import** that repository. The framework is detected
   automatically; no build command needs changing (`npm run build` already runs
   `prisma generate`, which Vercel's build cache would otherwise skip).
3. Add every variable from `.env.example` under **Settings → Environment Variables**
   for Production (and Preview, if you use preview deployments).
4. Deploy, then run the migrations against the production database:
   ```bash
   npx prisma migrate deploy
   ```

**A coaching centre that charges fees is commercial use, and Vercel's Hobby plan
does not allow it** — the Pro plan is required. This is Vercel's own rule, not a
technical limit.

---

## 10. Storage configuration

Uploaded files never touch the filesystem: a Vercel function gets no disk that
survives the request. Everything goes to S3-compatible storage configured through
`STORAGE_*` — Vercel Blob, Cloudflare R2 and Backblaze B2 all work.

Private files (student photos, payment screenshots) are **not** served from a
public bucket URL. They go through an authorised route that checks who is asking
first, the same rule `Orbit/media.php` enforces today.

---

## 11. Email configuration

Set `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` and `EMAIL_FROM`.
Gmail requires an **App Password**, not the account password.

---

## 12. Production security checklist

- [ ] `AUTH_SECRET` is a fresh 32-byte random value, not a copied example
- [ ] No secret is prefixed `NEXT_PUBLIC_`
- [ ] `.env`, `.env.local` are git-ignored and no secret was ever committed
- [ ] `LEGACY_MYSQL_*` is **not** set in Vercel
- [ ] Every route under `/admin`, `/teacher`, `/student`, `/guardian` checks the
      session **on the server**; hiding a button is not access control
- [ ] Branch-scoped queries filter by branch in the query itself, so another
      branch's rows cannot be reached by changing an id in the URL
- [ ] Uploads validate type and size on the server, not only in the browser
- [ ] Passwords are hashed with bcrypt; none is stored or logged in plain text
- [ ] Private portal pages send `Cache-Control: no-store` (set in `next.config.ts`)
- [ ] The service worker caches no authenticated response

---

## Project layout

```text
app/              routes — (auth) (student) (guardian) (teacher) (admin) api
components/       shared UI
lib/
  db/             Prisma client (one instance per process)
  auth/           sessions, guards, role checks
  storage/        S3-compatible adapter
  email/          provider behind env vars
  validation/     zod schemas shared by forms and routes
prisma/
  schema.prisma   65 models generated from the original MySQL schema
  migrations/
  seed/
docs/
  MIGRATION_INVENTORY.md   every page, its tables, guards and target
  DATA_MIGRATION.md        MySQL → PostgreSQL procedure
```
