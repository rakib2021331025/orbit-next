# MySQL → PostgreSQL: moving the existing data

The original database (`orbit_coaching`, MySQL/MariaDB) is **never written to,
altered or dropped** by anything here. The import reads it and writes into a
separate PostgreSQL database.

Until parity is reached, the PHP app and its MySQL database stay the live system.

---

## Before you start

1. **Back up MySQL.** Admin → System → Database Backup in the running app, or:
   ```bash
   mysqldump -u root --single-transaction --default-character-set=utf8mb4 \
     orbit_coaching > orbit_backup_$(date +%Y%m%d).sql
   ```
2. **Use a development PostgreSQL database first.** Do not point the import at a
   production database until a full run has been checked.
3. Set `LEGACY_MYSQL_*` in `.env.local` — read-only credentials are enough, and
   read-only is the safer choice. MySQL must be running (XAMPP) for both the dry
   run and the import.
4. Set `DATABASE_URL` / `DIRECT_URL` to the (empty) PostgreSQL database.

---

## The procedure

```bash
npm run db:deploy                  # create the PostgreSQL tables from prisma/migrations
npm run import:mysql -- --dry-run  # read MySQL only: counts + every value that would not survive
npm run import:mysql               # copy the rows across
```

Run the dry run first and read its "Conversion notes". It needs no PostgreSQL at
all, and it exits non-zero if any row would be rejected. Do **not** run
`npm run db:seed` on a database you are importing into: the seed creates an admin
and a branch with id 1, which would collide with the imported ones (the importer
would then skip the original row, and the count check would fail).

The importer (`prisma/seed/import-legacy.ts`):

- takes its table list, column types, enums and foreign keys from the Prisma
  schema itself, so a column added to `schema.prisma` is imported without
  editing the script;
- opens MySQL `READ ONLY` inside one consistent snapshot and sends nothing but
  `SHOW` / `SELECT`;
- reads each table in foreign-key dependency order (printed at the start), so a
  row never arrives before the row it references;
- keeps the original primary keys and inserts in batches of 1,000 with
  `INSERT … ON CONFLICT DO NOTHING` (`createMany({ skipDuplicates })`): running it
  twice changes nothing, and a half-finished run is simply repeated. An existing
  PostgreSQL row is **left as it is, not updated** — to re-import a table after
  fixing data in MySQL, empty that table in PostgreSQL first;
- rejects (and reports) a row it cannot store faithfully rather than guessing:
  an orphaned foreign key, an invalid value in a required enum, an integer out
  of range, a NULL in a required column with no default;
- resets each table's sequence to `MAX(id)` afterwards, otherwise PostgreSQL
  would hand out an id that already exists the first time a new row is inserted;
- prints MySQL vs PostgreSQL row counts per table and **exits non-zero on any
  mismatch**; MySQL tables with no Prisma model are listed, not imported.

---

## Differences that need care

| | MySQL (original) | PostgreSQL | What the import does |
|---|---|---|---|
| Zero dates | `0000-00-00` is accepted | rejected | stored as `NULL` (or the column default when the column is required) |
| Impossible dates | `2024-00-10` is accepted | rejected | `NULL`, reported |
| `DATETIME` / `TIMESTAMP` | Dhaka wall-clock (`SET time_zone = '+06:00'` in `config.php`) | Prisma stores UTC | converted to the real instant using `LEGACY_MYSQL_TZ` (default `+06:00`); `DATE` and `TIME` keep their literal value |
| `tinyint(1)` | 0 / 1 | `boolean` | 0 → false, anything else → true; NULL in a required boolean → false |
| ENUM | inline per column; `''` for an invalid value in non-strict mode | a real type | one named enum per column, same values; `''`/unknown → `NULL` if the column is nullable, **row rejected** if required (never the default — `admins.role` defaults to `super_admin`) |
| Empty string in a date/number | coerced silently | rejected | `NULL` |
| `DECIMAL` | exact | `numeric` | read as a string, never through a float |
| NUL byte in text | allowed | rejected | stripped, reported |
| `utf8mb4` | 4-byte safe | `UTF8` is 4-byte safe | unchanged; Bangla needs this |
| Case sensitivity | table names case-insensitive on Windows | case-sensitive | `@@map` pins the exact name |
| `AUTO_INCREMENT` | per table | sequence | sequence set to `MAX(id)` after import |

---

## Verifying the result

```bash
# MySQL
mysql -u root orbit_coaching -e "
  SELECT 'students', COUNT(*) FROM students
  UNION ALL SELECT 'payments', COUNT(*) FROM payments
  UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
  UNION ALL SELECT 'exam_results', COUNT(*) FROM exam_results;"

# PostgreSQL
psql "$DIRECT_URL" -c "
  SELECT 'students', COUNT(*) FROM students
  UNION ALL SELECT 'payments', COUNT(*) FROM payments
  UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
  UNION ALL SELECT 'exam_results', COUNT(*) FROM exam_results;"
```

The counts must match exactly. Check as well:

- a student's photo path still resolves after the files are moved to object storage;
- money columns are `Decimal`, not float — compare a few `payments.amount` values;
- Bangla text reads correctly (`students.name_bn`, `notice.title_bn`);
- `branch_id` is intact everywhere, because branch isolation depends on it.

---

## Files

Rows move with the import; **uploaded files do not**. `uploads/` in the original
(student photos, payment screenshots, study materials, AI question photos) has to
be copied into the S3-compatible bucket configured by `STORAGE_*`, keeping the
same relative paths so the stored paths still resolve.

That copy is a separate step and is deliberately not automated here: it is done
once, by hand, with the original left untouched.
