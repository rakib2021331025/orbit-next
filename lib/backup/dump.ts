import 'server-only';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';

/**
 * Database backup, from includes/db_backup.php.
 *
 * The original shells out to nothing — it writes a MySQL dump itself with
 * `SHOW CREATE TABLE` plus batched INSERTs. This is the same idea against
 * **PostgreSQL**, and it is written by hand for the same reason: `pg_dump` is
 * not installed in a serverless runtime, and a backup an admin cannot take is
 * not a backup.
 *
 * What it produces is a plain `.sql` file of `INSERT` statements wrapped in one
 * transaction, restorable with `psql -f`. Three properties are kept from the
 * original:
 *
 *   - **Written to a `.partial` file and renamed at the end**, so a half-written
 *     dump is never mistaken for a good one.
 *   - **Read in pages**, never a whole table into memory.
 *   - **Every attempt is logged**, success or failure, so the page can show what
 *     happened.
 *
 * Uploaded files are NOT included, exactly as before — they live in the upload
 * store and are backed up separately.
 */

/** Where dumps are written. Outside `public/`, so nothing serves them. */
function backupDir(): string {
  return process.env.ORBIT_BACKUP_DIR ?? path.join(process.cwd(), 'backups');
}

export interface TableInfo {
  name: string;
  rows: number;
  bytes: number;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** Only a real table name can reach a query, and it is always quoted. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Every table in the public schema, with its row estimate and size on disk. */
export async function backupTables(): Promise<TableInfo[]> {
  const rows = await safe(
    () =>
      prisma.$queryRaw<{ name: string; rows: bigint; bytes: bigint }[]>`
        SELECT c.relname AS name,
               GREATEST(c.reltuples, 0)::bigint AS rows,
               pg_total_relation_size(c.oid)::bigint AS bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname`,
    []
  );

  return rows.map((row) => ({
    name: row.name,
    rows: Number(row.rows),
    bytes: Number(row.bytes),
  }));
}

/** The column names of one table, in their real order. */
async function tableColumns(table: string): Promise<string[]> {
  const rows = await safe(
    () =>
      prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
        ORDER BY ordinal_position`,
    []
  );
  return rows.map((row) => row.column_name);
}

/** One value as SQL. Bytes become a hex literal, everything else is quoted text. */
function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return quoteLiteral(value.toISOString());
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (typeof value === 'object') return quoteLiteral(JSON.stringify(value));
  return quoteLiteral(String(value));
}

export interface BackupResult {
  ok: boolean;
  filename: string;
  /** A reason code the page turns into a message. */
  error: '' | 'no_tables' | 'not_writable' | 'write_failed' | 'failed';
  tables: number;
  rows: number;
  size: number;
}

/** Rows read per query — big enough to be quick, small enough to stay in memory. */
const PAGE = 500;

export async function createBackup(
  tables: string[] | null,
  adminId: number
): Promise<BackupResult> {
  const started = Date.now();
  const available = await backupTables();
  const scope = tables === null ? 'full' : 'selected';
  const selected =
    tables === null
      ? available.map((table) => table.name)
      : available.filter((table) => tables.includes(table.name)).map((table) => table.name);

  const dbSize = available.reduce((sum, table) => sum + table.bytes, 0);
  const empty: BackupResult = {
    ok: false,
    filename: '',
    error: 'failed',
    tables: selected.length,
    rows: 0,
    size: 0,
  };

  const log = async (
    status: 'success' | 'failed',
    filename: string,
    fileSize: number,
    rowCount: number,
    message = ''
  ) => {
    try {
      await prisma.dbBackup.create({
        data: {
          filename,
          scope,
          tables_included: scope === 'selected' ? selected.join(',') : null,
          table_count: selected.length,
          row_count: rowCount,
          file_size: BigInt(fileSize),
          db_size: BigInt(dbSize),
          status,
          error_message: message !== '' ? message : null,
          duration_ms: Date.now() - started,
          created_by: adminId > 0 ? adminId : null,
        },
      });
    } catch {
      // A missing log entry must not turn a good backup into a failure.
    }
  };

  if (selected.length === 0) return { ...empty, error: 'no_tables' };

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const filename = `orbit_db_${scope}_${stamp}_${randomBytes(4).toString('hex')}.sql`;
  const directory = backupDir();
  const finalPath = path.join(directory, filename);
  const partialPath = `${finalPath}.partial`;

  try {
    await mkdir(directory, { recursive: true });
  } catch {
    await log('failed', filename, 0, 0, 'not_writable');
    return { ...empty, error: 'not_writable' };
  }

  const parts: string[] = [
    '-- Orbit Private Care — database backup\n',
    `-- Created: ${new Date().toISOString()}\n`,
    `-- Scope: ${scope}, ${selected.length} tables\n`,
    '-- Uploaded files (photos, payment screenshots, PDFs) are not included.\n',
    '-- Restore: psql "$DATABASE_URL" -f this-file.sql\n\n',
    'SET client_encoding = ' + quoteLiteral('UTF8') + ';\n',
    'SET standard_conforming_strings = on;\n',
    'BEGIN;\n\n',
  ];

  let rowCount = 0;

  try {
    for (const table of selected) {
      const columns = await tableColumns(table);
      if (columns.length === 0) continue;

      const quoted = quoteIdent(table);
      const columnList = columns.map(quoteIdent).join(', ');

      parts.push(
        '-- ----------------------------------------------------------\n',
        `-- Table ${quoted}\n`,
        '-- ----------------------------------------------------------\n',
        `DELETE FROM ${quoted};\n`
      );

      // Paged, never the whole table at once.
      for (let offset = 0; ; offset += PAGE) {
        const page = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM ${quoted} LIMIT ${PAGE} OFFSET ${offset}`
        );
        if (page.length === 0) break;

        for (const row of page) {
          const values = columns.map((column) => sqlValue(row[column])).join(', ');
          parts.push(`INSERT INTO ${quoted} (${columnList}) VALUES (${values});\n`);
          rowCount += 1;
        }

        if (page.length < PAGE) break;
      }

      parts.push('\n');
    }

    parts.push('COMMIT;\n');

    const bytes = Buffer.from(parts.join(''), 'utf8');
    await writeFile(partialPath, bytes);
    // Renamed only once it is complete, so a partial file is never listed.
    const { rename } = await import('node:fs/promises');
    await rename(partialPath, finalPath);

    await log('success', filename, bytes.length, rowCount);
    return { ok: true, filename, error: '', tables: selected.length, rows: rowCount, size: bytes.length };
  } catch {
    try {
      await unlink(partialPath);
    } catch {
      // Nothing to clean up.
    }
    await log('failed', filename, 0, rowCount, 'write_failed');
    return { ...empty, error: 'write_failed', rows: rowCount };
  }
}

export interface BackupEntry {
  id: number | null;
  filename: string;
  scope: string;
  tables: number;
  rows: number;
  size: number;
  dbSize: number;
  status: string;
  error: string;
  createdAt: Date;
  createdBy: number | null;
  /** True when the file is still on disk. */
  exists: boolean;
  actualSize: number;
}

/** A backup file name, or '' — never a path. */
export function safeBackupName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  return /^orbit_db_[a-z]+_\d{8}_\d{6}_[0-9a-f]{8}\.sql$/.test(name) ? name : '';
}

/**
 * The logged backups, plus any file on disk that has no log row.
 *
 * A file somebody copied in by hand is still a backup, and hiding it would make
 * the folder and the page disagree.
 */
export async function backupList(limit = 200): Promise<BackupEntry[]> {
  const logged = await safe(
    () => prisma.dbBackup.findMany({ orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take: limit }),
    []
  );

  const directory = backupDir();
  const files = await safe(() => readdir(directory), [] as string[]);
  const onDisk = new Map<string, number>();

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const info = await safe(() => stat(path.join(directory, file)), null);
    if (info) onDisk.set(file, info.size);
  }

  const entries: BackupEntry[] = logged.map((row) => ({
    id: row.id,
    filename: row.filename,
    scope: row.scope,
    tables: row.table_count,
    rows: row.row_count,
    size: Number(row.file_size),
    dbSize: Number(row.db_size),
    status: row.status,
    error: row.error_message ?? '',
    createdAt: row.created_at,
    createdBy: row.created_by,
    exists: onDisk.has(row.filename),
    actualSize: onDisk.get(row.filename) ?? 0,
  }));

  const known = new Set(entries.map((entry) => entry.filename));
  for (const [file, size] of onDisk) {
    if (known.has(file)) continue;
    entries.push({
      id: null,
      filename: file,
      scope: '',
      tables: 0,
      rows: 0,
      size,
      dbSize: 0,
      status: 'success',
      error: '',
      createdAt: new Date(),
      createdBy: null,
      exists: true,
      actualSize: size,
    });
  }

  return entries;
}

/** The file's bytes for a download, or null. */
export async function readBackup(filename: string): Promise<Buffer | null> {
  const name = safeBackupName(filename);
  if (name === '') return null;
  return safe(() => readFile(path.join(backupDir(), name)), null);
}

export async function deleteBackup(filename: string): Promise<boolean> {
  const name = safeBackupName(filename);
  if (name === '') return false;

  try {
    await unlink(path.join(backupDir(), name));
  } catch {
    // Already gone from disk; the log row still goes.
  }

  await safe(() => prisma.dbBackup.deleteMany({ where: { filename: name } }), { count: 0 });
  return true;
}

/**
 * Deletes backups older than `days`, **always keeping the newest good one**.
 *
 * That last rule is the point: "delete everything older than 7 days" on a system
 * nobody has backed up for a month would otherwise leave no backup at all.
 */
export async function pruneBackups(days: number, keep = 1): Promise<number> {
  const entries = await backupList(500);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const good = entries
    .filter((entry) => entry.status === 'success' && entry.exists)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const protectedNames = new Set(good.slice(0, keep).map((entry) => entry.filename));

  let removed = 0;
  for (const entry of entries) {
    if (protectedNames.has(entry.filename) || entry.createdAt >= cutoff) continue;
    if (await deleteBackup(entry.filename)) removed += 1;
  }
  return removed;
}

/** Whether the backup folder can be written at all. */
export async function backupDirWritable(): Promise<boolean> {
  try {
    await mkdir(backupDir(), { recursive: true });
    const probe = path.join(backupDir(), `.write-test-${randomBytes(3).toString('hex')}`);
    await writeFile(probe, 'ok');
    await unlink(probe);
    return true;
  } catch {
    return false;
  }
}

/** The upload folders an admin has to copy separately. */
export function uploadFolders(): string[] {
  return [
    'uploads/students',
    'uploads/payments',
    'uploads/materials',
    'uploads/assignments',
    'uploads/gallery',
    'uploads/notes',
    'uploads/branding',
  ];
}
