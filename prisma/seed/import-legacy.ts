/**
 * One-off copy of the live MySQL database into PostgreSQL: `npm run import:mysql`.
 *
 *   npm run import:mysql -- --dry-run   read MySQL only; report counts and every
 *                                       value that would not survive the move
 *   npm run import:mysql                copy the rows (needs DATABASE_URL and
 *                                       `npm run db:deploy` done first)
 *
 * MySQL is only ever READ. The session is opened READ ONLY and the script sends
 * nothing but SHOW / SELECT; give it a read-only MySQL user all the same
 * (docs/DATA_MIGRATION.md).
 *
 * The table list, column types, enums and foreign keys are not written out
 * here: they come from the Prisma schema itself (Prisma.dmmf). Every model
 * carries @@map("original_table") and every field keeps its MySQL spelling, so
 * the mapping is 1:1 and a column added to schema.prisma is imported without
 * touching this file.
 *
 * Re-running is safe: rows go in with createMany({ skipDuplicates }), i.e.
 * INSERT … ON CONFLICT DO NOTHING on the original primary key. An existing
 * row is left as it is, not updated — a half-finished run is simply repeated.
 */
import mysql from 'mysql2/promise';
import { Prisma, PrismaClient } from '@prisma/client';
import { env, loadEnv } from './env';

loadEnv();

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 1000;

/**
 * The zone the PHP app wrote its DATETIMEs in. config.php pins every MySQL
 * session to ORBIT_TZ_OFFSET ('+06:00', Asia/Dhaka, no DST), so NOW() and PHP's
 * time() agree. Prisma stores DateTime as UTC, and PostgreSQL's now() default
 * writes UTC too, so a Dhaka wall-clock value is converted to the real instant
 * here — otherwise every imported timestamp would sit six hours in the future
 * next to the rows the new app creates.
 */
const LEGACY_TZ = env('LEGACY_MYSQL_TZ', '+06:00');

type DmmfModel = Prisma.DMMF.Model;
type DmmfField = Prisma.DMMF.Field;

const models = Prisma.dmmf.datamodel.models as readonly DmmfModel[];
const enumValues = new Map<string, Set<string>>(
  (Prisma.dmmf.datamodel.enums as readonly Prisma.DMMF.DatamodelEnum[]).map((e) => [
    e.name,
    new Set(e.values.map((v) => v.dbName ?? v.name)),
  ]),
);

const tableOf = (m: DmmfModel): string => m.dbName ?? m.name;
const columnOf = (f: DmmfField): string => f.dbName ?? f.name;
const scalarFields = (m: DmmfModel): DmmfField[] =>
  m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum');
const pkFields = (m: DmmfModel): string[] =>
  m.primaryKey?.fields.length ? [...m.primaryKey.fields] : m.fields.filter((f) => f.isId).map((f) => f.name);
const delegateOf = (m: DmmfModel): string => m.name.charAt(0).toLowerCase() + m.name.slice(1);
const nativeTypeOf = (f: DmmfField): string | undefined =>
  (f as DmmfField & { nativeType?: [string, string[]] | null }).nativeType?.[0];

/** Relations this model holds the foreign key for: its parents. */
function foreignKeys(m: DmmfModel) {
  return m.fields
    .filter((f) => f.kind === 'object' && f.relationFromFields && f.relationFromFields.length > 0)
    .map((f) => ({
      parent: f.type,
      from: [...(f.relationFromFields ?? [])],
      to: [...(f.relationToFields ?? [])],
    }));
}

/**
 * Parents before children, so no row arrives before the row it references.
 * Ties are broken alphabetically to keep the log stable between runs.
 */
function dependencyOrder(): DmmfModel[] {
  const byName = new Map(models.map((m) => [m.name, m]));
  const pending = new Map(
    models.map((m) => [m.name, new Set(foreignKeys(m).map((fk) => fk.parent).filter((p) => p !== m.name))]),
  );
  const ordered: DmmfModel[] = [];
  while (pending.size > 0) {
    const ready = [...pending.entries()].filter(([, deps]) => deps.size === 0).map(([name]) => name).sort();
    if (ready.length === 0) {
      throw new Error(`Foreign-key cycle between: ${[...pending.keys()].join(', ')}`);
    }
    for (const name of ready) {
      ordered.push(byName.get(name)!);
      pending.delete(name);
      for (const deps of pending.values()) deps.delete(name);
    }
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Value conversion
// ---------------------------------------------------------------------------

class Problems {
  private counts = new Map<string, { n: number; example: string }>();
  add(message: string, where: string): void {
    const hit = this.counts.get(message);
    if (hit) hit.n += 1;
    else this.counts.set(message, { n: 1, example: where });
  }
  get size(): number {
    return this.counts.size;
  }
  lines(): string[] {
    return [...this.counts.entries()].map(([msg, { n, example }]) => `${msg} ×${n} (first: ${example})`);
  }
}

/** Sentinel: the value cannot be stored, the row must be rejected. */
const REJECT = Symbol('reject');
/** Sentinel: leave the column out so the PostgreSQL default applies. */
const OMIT = Symbol('omit');
type Converted = unknown | typeof REJECT | typeof OMIT;

const ZERO_DATE = /^0000-00-00/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function isRealDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31;
}

function toDateTime(raw: unknown, field: DmmfField): Date | null | string {
  const s = String(raw).trim();
  if (s === '' || ZERO_DATE.test(s)) return null;
  const native = nativeTypeOf(field);

  if (native === 'Time') {
    // TIME columns come back as 'HH:MM:SS'. Prisma keeps only the time part and
    // writes it as UTC, so the literal value is stored — a class that starts at
    // 16:00 in Dhaka still reads 16:00. MySQL TIME may exceed 24h; PG may not.
    const t = /^(\d{2}):(\d{2}):(\d{2})/.exec(s);
    if (!t || Number(t[1]) > 23) return `invalid time '${s}'`;
    return new Date(`1970-01-01T${t[1]}:${t[2]}:${t[3]}Z`);
  }

  if (!isRealDate(s)) return `invalid date '${s}'`; // e.g. '2024-00-10', which MySQL accepts
  if (native === 'Date') {
    // DATE has no zone: store the literal day at UTC midnight, as Prisma does.
    return new Date(`${s.slice(0, 10)}T00:00:00Z`);
  }

  const iso = s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T');
  const d = new Date(`${iso}${LEGACY_TZ}`);
  return Number.isNaN(d.getTime()) ? `invalid datetime '${s}'` : d;
}

function convert(raw: unknown, field: DmmfField, problems: Problems, where: string): Converted {
  const col = columnOf(field);
  let value: unknown = raw;

  if (value !== null && value !== undefined) {
    switch (field.type) {
      case 'Boolean':
        // tinyint(1) → number, BIT(1) → Buffer, the odd '0'/'1' string.
        value = Buffer.isBuffer(value) ? value.some((b) => b !== 0) : Number(value) !== 0;
        break;

      case 'Int': {
        if (value === '') {
          value = null;
          break;
        }
        const n = Number(value);
        if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647) {
          problems.add(`${col}: '${String(value)}' is not a 32-bit integer`, where);
          return REJECT;
        }
        value = n;
        break;
      }

      case 'BigInt':
        if (value === '') value = null;
        else value = BigInt(String(value));
        break;

      case 'Float':
        value = value === '' ? null : Number(value);
        break;

      case 'Decimal': {
        // mysql2 returns DECIMAL as a string, which Prisma takes as-is: no
        // float rounding of money on the way through.
        const s = String(value).trim();
        if (s === '') value = null;
        else if (!/^-?\d+(\.\d+)?$/.test(s)) {
          problems.add(`${col}: '${s}' is not a decimal`, where);
          return REJECT;
        } else value = s;
        break;
      }

      case 'DateTime': {
        const d = toDateTime(value, field);
        if (typeof d === 'string') {
          problems.add(`${col}: ${d}`, where);
          value = null;
        } else {
          if (d === null && ZERO_DATE.test(String(value))) problems.add(`${col}: zero date → NULL`, where);
          value = d;
        }
        break;
      }

      case 'Json':
        try {
          value = typeof value === 'string' ? JSON.parse(value) : value;
        } catch {
          problems.add(`${col}: invalid JSON`, where);
          return REJECT;
        }
        break;

      case 'String': {
        let s = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
        // PostgreSQL text cannot hold NUL; MySQL can. Strip it rather than
        // lose the row.
        if (s.includes('\u0000')) {
          problems.add(`${col}: NUL byte stripped`, where);
          s = s.replace(/\u0000/g, '');
        }
        value = s;
        break;
      }

      default:
        if (field.kind === 'enum') {
          // A MySQL ENUM in non-strict mode stores '' for an invalid value.
          const allowed = enumValues.get(field.type);
          const s = String(value);
          if (!allowed?.has(s)) {
            if (s !== '') problems.add(`${col}: '${s}' is not a ${field.type} value`, where);
            else problems.add(`${col}: empty enum value`, where);
            // Never fall back to the column default for a required enum: for
            // admins.role that default is super_admin, and a damaged row must
            // not come out of the import with more access than it went in with.
            if (field.isRequired) return REJECT;
            value = null;
          }
        }
    }
  }

  if (value === null || value === undefined) {
    if (!field.isRequired) return null;
    if (field.hasDefaultValue) {
      problems.add(`${col}: NULL in a NOT NULL column — PostgreSQL default used`, where);
      return OMIT;
    }
    if (field.type === 'Boolean') {
      // tinyint(1) NOT NULL DEFAULT 0 in MySQL; the converted schema lost the
      // default, and 0 is what MySQL would have stored.
      problems.add(`${col}: NULL boolean read as false`, where);
      return false;
    }
    problems.add(`${col}: NULL in a required column with no default`, where);
    return REJECT;
  }
  return value;
}

// ---------------------------------------------------------------------------
// The import
// ---------------------------------------------------------------------------

type TableReport = {
  table: string;
  mysql: number;
  converted: number;
  rejected: number;
  postgres: number | null;
  problems: Problems;
  droppedColumns: string[];
  missingColumns: string[];
};

const quoteMy = (name: string) => `\`${name.replace(/`/g, '``')}\``;
const quotePg = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function main(): Promise<void> {
  // Worked out before connecting, so a schema problem shows up even with MySQL down.
  const order = dependencyOrder();
  console.log(`Import order (${order.length} tables): ${order.map(tableOf).join(' → ')}
`);

  const database = env('LEGACY_MYSQL_DATABASE', 'orbit_coaching');
  const my = await mysql.createConnection({
    host: env('LEGACY_MYSQL_HOST', 'localhost'),
    port: Number(env('LEGACY_MYSQL_PORT', '3306')),
    user: env('LEGACY_MYSQL_USER', 'root'),
    password: env('LEGACY_MYSQL_PASSWORD'),
    database,
    charset: 'utf8mb4',
    // Raw strings for every date and decimal: the conversion above decides
    // what they mean, not the driver's local timezone.
    dateStrings: true,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // Read-only for the whole session, and one consistent snapshot across all
  // tables so a payment is never read without the student it belongs to.
  await my.query(`SET time_zone = ?`, [LEGACY_TZ]);
  await my.query('SET SESSION TRANSACTION READ ONLY');
  await my.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');

  const pg = DRY_RUN ? null : new PrismaClient({ log: ['warn', 'error'] });

  const [tableRows] = await my.query<mysql.RowDataPacket[]>(
    `SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'`,
  );
  const mysqlTables = new Map<string, string>(); // lower-case → real name
  for (const row of tableRows) {
    const name = String(Object.values(row)[0]);
    mysqlTables.set(name.toLowerCase(), name);
  }

  const known = new Set(models.map((m) => tableOf(m).toLowerCase()));
  const unknownTables = [...mysqlTables.values()].filter((t) => !known.has(t.toLowerCase())).sort();

  // Key values seen per parent table, so an orphaned row (possible where a
  // foreign key was added to MySQL after the data) is reported instead of
  // failing a whole PostgreSQL batch.
  const seenKeys = new Map<string, Set<string>>(); // `${model}.${fields}` → values
  const keyOf = (row: Record<string, unknown>, fields: string[]) =>
    fields.map((f) => String(row[f])).join('\u0001');

  const referenced = new Map<string, string[][]>();
  for (const m of models) {
    for (const fk of foreignKeys(m)) {
      const list = referenced.get(fk.parent) ?? [];
      if (!list.some((l) => l.join() === fk.to.join())) list.push(fk.to);
      referenced.set(fk.parent, list);
    }
  }

  const reports: TableReport[] = [];
  console.log(`${DRY_RUN ? 'DRY RUN — reading' : 'Importing'} ${database} (${mysqlTables.size} tables)\n`);

  for (const model of order) {
    const table = tableOf(model);
    const problems = new Problems();
    const report: TableReport = {
      table,
      mysql: 0,
      converted: 0,
      rejected: 0,
      postgres: null,
      problems,
      droppedColumns: [],
      missingColumns: [],
    };
    reports.push(report);

    const realName = mysqlTables.get(table.toLowerCase());
    if (!realName) {
      problems.add('table does not exist in MySQL — nothing to import', table);
      if (pg) report.postgres = await countPg(pg, table);
      continue;
    }

    const [colRows] = await my.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [database, realName],
    );
    const mysqlCols = new Set(colRows.map((r) => String(r.c)));
    const fields = scalarFields(model);
    const present = fields.filter((f) => mysqlCols.has(columnOf(f)));
    report.missingColumns = fields.filter((f) => !mysqlCols.has(columnOf(f))).map(columnOf);
    const fieldCols = new Set(fields.map(columnOf));
    report.droppedColumns = [...mysqlCols].filter((c) => !fieldCols.has(c));

    const pk = pkFields(model);
    const pkCols = pk.map((name) => columnOf(fields.find((f) => f.name === name)!));
    const fks = foreignKeys(model);
    const wanted = referenced.get(model.name) ?? [];

    const [[countRow]] = await my.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${quoteMy(realName)}`);
    report.mysql = Number(countRow.n);

    const select = present.map((f) => quoteMy(columnOf(f))).join(', ');
    const orderBy = pkCols.map(quoteMy).join(', ');

    for (let offset = 0; offset < report.mysql; offset += BATCH) {
      const [rows] = await my.query<mysql.RowDataPacket[]>(
        `SELECT ${select} FROM ${quoteMy(realName)} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [BATCH, offset],
      );
      const batch: Record<string, unknown>[] = [];

      for (const row of rows) {
        const where = `${table} ${pkCols.map((c) => `${c}=${String(row[c])}`).join(',')}`;
        const data: Record<string, unknown> = {};
        let ok = true;
        for (const field of present) {
          const v = convert(row[columnOf(field)], field, problems, where);
          if (v === REJECT) ok = false;
          else if (v !== OMIT) data[field.name] = v;
        }

        for (const fk of ok ? fks : []) {
          if (fk.from.some((f) => data[f] === null || data[f] === undefined)) continue;
          const parentKeys = seenKeys.get(`${fk.parent}.${fk.to.join()}`);
          if (parentKeys && !parentKeys.has(keyOf(data, fk.from))) {
            problems.add(`${fk.from.join(',')} → ${fk.parent} row that does not exist (orphan)`, where);
            ok = false;
          }
        }

        if (!ok) {
          report.rejected += 1;
          continue;
        }
        report.converted += 1;
        for (const to of wanted) {
          const key = `${model.name}.${to.join()}`;
          if (!seenKeys.has(key)) seenKeys.set(key, new Set());
          seenKeys.get(key)!.add(keyOf(data, to));
        }
        batch.push(data);
      }

      if (pg && batch.length > 0) {
        const delegate = (pg as unknown as Record<string, { createMany: (a: unknown) => Promise<unknown> }>)[
          delegateOf(model)
        ];
        await delegate.createMany({ data: batch, skipDuplicates: true });
      }
    }

    if (pg) {
      await resetSequence(pg, model);
      report.postgres = await countPg(pg, table);
    }

    const pgPart = report.postgres === null ? '' : `  postgres ${report.postgres}`;
    console.log(
      `${table.padEnd(26)} mysql ${String(report.mysql).padStart(6)}  ok ${String(report.converted).padStart(6)}` +
        `${report.rejected ? `  REJECTED ${report.rejected}` : ''}${pgPart}`,
    );
  }

  await my.query('COMMIT'); // ends the read-only snapshot; nothing was written
  await my.end();

  // --- Report --------------------------------------------------------------
  console.log('\nConversion notes');
  let anyNotes = false;
  for (const r of reports) {
    const notes = [
      ...r.problems.lines(),
      ...(r.droppedColumns.length ? [`MySQL columns not in the schema (not copied): ${r.droppedColumns.join(', ')}`] : []),
      ...(r.missingColumns.length ? [`schema columns absent in MySQL (default used): ${r.missingColumns.join(', ')}`] : []),
    ];
    if (notes.length === 0) continue;
    anyNotes = true;
    console.log(`  ${r.table}`);
    for (const n of notes) console.log(`    - ${n}`);
  }
  if (!anyNotes) console.log('  none');

  if (unknownTables.length > 0) {
    console.log(`\nMySQL tables with no Prisma model (not imported): ${unknownTables.join(', ')}`);
  }

  const mismatched = reports.filter((r) =>
    DRY_RUN ? r.rejected > 0 : r.postgres !== null && r.postgres !== r.mysql,
  );
  console.log(`\n${'table'.padEnd(26)} ${'mysql'.padStart(7)} ${(DRY_RUN ? 'ok' : 'postgres').padStart(9)}`);
  for (const r of reports) {
    const other = DRY_RUN ? r.converted : r.postgres;
    const flag = mismatched.includes(r) ? '  <-- MISMATCH' : '';
    console.log(`${r.table.padEnd(26)} ${String(r.mysql).padStart(7)} ${String(other ?? '-').padStart(9)}${flag}`);
  }

  if (mismatched.length > 0) {
    console.error(
      `\n${mismatched.length} table(s) ${DRY_RUN ? 'have rows that would be rejected' : 'do not match MySQL'}: ` +
        mismatched.map((r) => r.table).join(', '),
    );
    process.exitCode = 1;
  } else {
    console.log(`\n${DRY_RUN ? 'Every row converts cleanly.' : 'Row counts match for every table.'}`);
  }

  await pg?.$disconnect();
}

async function countPg(pg: PrismaClient, table: string): Promise<number> {
  const rows = await pg.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM ${quotePg(table)}`);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Rows were inserted with their original ids, which does not advance a
 * PostgreSQL sequence: without this the first new student would be given id 1
 * and fail on the primary key. The same job MySQL's AUTO_INCREMENT does by itself.
 */
async function resetSequence(pg: PrismaClient, model: DmmfModel): Promise<void> {
  const idField = model.fields.find(
    (f) => f.isId && typeof f.default === 'object' && f.default !== null && 'name' in f.default &&
      (f.default as { name: string }).name === 'autoincrement',
  );
  if (!idField) return;
  const table = quotePg(tableOf(model));
  const col = quotePg(columnOf(idField));
  await pg.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('${table.replace(/'/g, "''")}', '${columnOf(idField)}'),
                   COALESCE(MAX(${col}), 1), MAX(${col}) IS NOT NULL) FROM ${table}`,
  );
}

main().catch((err) => {
  // mysql2 reports a refused connection as an AggregateError with an empty
  // message; the code (ECONNREFUSED, ER_ACCESS_DENIED_ERROR…) is the useful part.
  const e = err as Error & { code?: string };
  console.error(`Import failed: ${[e.code, e.message].filter(Boolean).join(' — ') || String(err)}`);
  process.exitCode = 1;
});
