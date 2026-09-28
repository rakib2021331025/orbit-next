import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * Reading live classes, from the READING section of includes/live_class_lib.php.
 *
 * Used by the teacher screen and (later) the admin one. Everything here returns
 * a safe empty value on a database error rather than throwing: these feed a list
 * and four counters, and a page must not fail to render because a counter could
 * not be counted — that is the original's behaviour in every one of these
 * functions.
 */

export const CLASS_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export function isClassStatus(value: unknown): value is ClassStatus {
  return typeof value === 'string' && (CLASS_STATUSES as readonly string[]).includes(value);
}

export interface ClassFilters {
  teacher_id?: number;
  course?: string;
  batch?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

/** 'YYYY-MM-DD' for a real calendar date, else null — orbit_live_class_clean_date(). */
export function cleanDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Rejects 31 February the way checkdate() does: a rolled-over date comes back
  // as a different day.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** 'HH:MM:SS' for a 24-hour time, else null — orbit_live_class_clean_time(). */
export function cleanTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}

/** Midnight UTC of a 'YYYY-MM-DD' — how a DATE column round-trips through Prisma. */
export function dateValue(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** A TIME column's value: the clock carried on the epoch day, in UTC. */
export function timeValue(hms: string): Date {
  return new Date(`1970-01-01T${hms}.000Z`);
}

/** Today at midnight, for the date comparisons CURDATE() makes. */
function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export async function fetchLiveClasses(filters: ClassFilters = {}, take = 200) {
  const where: Record<string, unknown> = {};

  if (filters.teacher_id) where.teacher_id = filters.teacher_id;
  if (filters.course) where.course = filters.course;
  if (filters.batch) where.batch = filters.batch;
  if (isClassStatus(filters.status)) where.status = filters.status;

  const from = filters.date_from ? cleanDate(filters.date_from) : null;
  const to = filters.date_to ? cleanDate(filters.date_to) : null;
  if (from !== null || to !== null) {
    where.class_date = {
      ...(from !== null ? { gte: dateValue(from) } : {}),
      ...(to !== null ? { lte: dateValue(to) } : {}),
    };
  }

  const search = (filters.search ?? '').trim();
  if (search !== '') {
    where.OR = [
      { subject: { contains: search } },
      { topic: { contains: search } },
      { description: { contains: search } },
    ];
  }

  try {
    return await prisma.liveClass.findMany({
      where,
      orderBy: [{ class_date: 'desc' }, { start_time: 'desc' }],
      take: Math.max(1, Math.min(1000, take)),
      include: { _count: { select: { liveClassMaterial_live_class: true } } },
    });
  } catch {
    return [];
  }
}

export type LiveClassRow = Awaited<ReturnType<typeof fetchLiveClasses>>[number];
export type MaterialRow = Awaited<ReturnType<typeof prisma.liveClassMaterial.findMany>>[number];

/** Materials for a set of classes, grouped by class id. */
export async function classMaterials(classIds: number[]): Promise<Map<number, MaterialRow[]>> {
  const ids = [...new Set(classIds.filter((id) => Number.isInteger(id) && id > 0))];
  const grouped = new Map<number, MaterialRow[]>();
  if (ids.length === 0) return grouped;

  try {
    const rows = await prisma.liveClassMaterial.findMany({
      where: { live_class_id: { in: ids } },
      orderBy: { created_at: 'desc' },
    });
    for (const row of rows) {
      const list = grouped.get(row.live_class_id) ?? [];
      list.push(row);
      grouped.set(row.live_class_id, list);
    }
    return grouped;
  } catch {
    return grouped;
  }
}

export interface ClassStats {
  today: number;
  upcoming: number;
  completed: number;
  no_link: number;
}

/**
 * The four counters above the list.
 *
 * `no_link` is the one that earns its place: a scheduled class with no meeting
 * link is a class nobody can join, and it is only visible as a number.
 */
export async function classStats(teacherId?: number): Promise<ClassStats> {
  const scope = teacherId ? { teacher_id: teacherId } : {};
  const start = today();

  const count = async (where: Record<string, unknown>) => {
    try {
      return await prisma.liveClass.count({ where: { ...scope, ...where } });
    } catch {
      return 0;
    }
  };

  const [todayCount, upcoming, completed, noLink] = await Promise.all([
    count({ class_date: start, status: { not: 'cancelled' } }),
    count({ class_date: { gt: start }, status: 'scheduled' }),
    count({ status: 'completed' }),
    count({
      status: 'scheduled',
      class_date: { gte: start },
      OR: [{ meet_url: null }, { meet_url: '' }],
    }),
  ]);

  return { today: todayCount, upcoming, completed, no_link: noLink };
}

export type ClassStateKey = 'live' | 'upcoming' | 'finished' | 'completed' | 'cancelled';

export interface ClassState {
  key: ClassStateKey;
  joinable: boolean;
  tone: 'success' | 'info' | 'neutral' | 'danger';
}

/** The wall-clock instant a class begins, from its DATE and TIME columns. */
export function startOf(date: Date, startTime: Date): number {
  const start = new Date(date);
  start.setHours(startTime.getUTCHours(), startTime.getUTCMinutes(), startTime.getUTCSeconds(), 0);
  return start.getTime();
}

/**
 * Where a class stands right now — orbit_live_class_state().
 *
 * The ten-minute early window is deliberate: a student who opens the page just
 * before the hour must already be able to join, or they are locked out of a
 * class that is about to begin.
 */
export function classState(row: {
  status: string;
  class_date: Date;
  start_time: Date;
  duration_minutes: number;
}): ClassState {
  if (row.status === 'cancelled') return { key: 'cancelled', joinable: false, tone: 'danger' };
  if (row.status === 'completed') return { key: 'completed', joinable: false, tone: 'neutral' };

  const start = startOf(row.class_date, row.start_time);
  const end = start + row.duration_minutes * 60_000;
  const now = Date.now();

  if (now >= start - 10 * 60_000 && now <= end) {
    return { key: 'live', joinable: true, tone: 'success' };
  }
  if (now < start) return { key: 'upcoming', joinable: true, tone: 'info' };
  return { key: 'finished', joinable: false, tone: 'neutral' };
}

/**
 * The course and batch choices for the schedule form.
 *
 * Active rows, PLUS whichever ones the class being edited already uses — without
 * that, opening an old class on a since-retired batch and pressing save would
 * silently move it to another audience.
 */
export async function classFormOptions(
  editing?: { course: string | null; batch_id: number | null } | null
) {
  const courseName = (editing?.course ?? '').trim().toLowerCase();
  const batchId = editing?.batch_id ?? 0;

  try {
    const [courses, batches] = await Promise.all([
      prisma.course.findMany({
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, name_bn: true, status: true },
      }),
      prisma.batch.findMany({
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, name_bn: true, course_id: true, status: true },
      }),
    ]);

    return {
      courses: courses.filter(
        (course) =>
          course.status === 'active' ||
          (courseName !== '' &&
            (course.name.toLowerCase() === courseName ||
              (course.name_bn ?? '').toLowerCase() === courseName))
      ),
      batches: batches.filter(
        (batch) => batch.status === 'active' || (batchId > 0 && batch.id === batchId)
      ),
    };
  } catch {
    return { courses: [], batches: [] };
  }
}

export type ClassFormOptions = Awaited<ReturnType<typeof classFormOptions>>;

/**
 * Which option a stored class selects — orbit_live_class_form_selection().
 *
 * `'__keep'` stands for a free-text course or batch that is no longer in the
 * tables. It is an option in its own right so that editing such a class keeps
 * its audience instead of quietly widening it to everyone.
 */
export function classFormSelection(
  row: { course: string | null; batch: string | null; batch_id: number | null },
  options: ClassFormOptions
): { course: string; batch: string } {
  const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
  const course = norm(row.course);
  const batch = norm(row.batch);

  let courseSel = '';
  let courseRow: ClassFormOptions['courses'][number] | null = null;
  if (course !== '') {
    courseSel = '__keep';
    for (const candidate of options.courses) {
      if (norm(candidate.name) === course || norm(candidate.name_bn) === course) {
        courseSel = String(candidate.id);
        courseRow = candidate;
        break;
      }
    }
  }

  let batchSel = '';
  if (batch !== '') {
    batchSel = '__keep';
    if (courseRow) {
      const id = row.batch_id ?? 0;
      for (const candidate of options.batches) {
        if (candidate.course_id !== courseRow.id) continue;
        if ((id > 0 && candidate.id === id) || (id <= 0 && norm(candidate.name) === batch)) {
          batchSel = String(candidate.id);
          break;
        }
      }
    }
  }

  return { course: courseSel, batch: batchSel };
}
