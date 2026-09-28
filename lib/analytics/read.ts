import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * The read side of visitor analytics, from includes/analytics_lib.php.
 *
 * Every figure comes from `visitor_logs`, except for completed months, which are
 * snapshotted into `visitor_monthly_summary` so the permanent history survives
 * any pruning of the log. The snapshot is written when an admin opens the page —
 * shared hosting has no cron — and only ever **inserts**, never overwrites, so
 * repeating it is harmless.
 *
 * "Visits" counts distinct sessions, "unique visitors" distinct visitor ids, and
 * "page views" rows. Those three are deliberately different numbers.
 */

/** Visitors seen this recently count as online. */
const ONLINE_MINUTES = 5;

export interface Stats {
  page_views: number;
  visits: number;
  unique_visitors: number;
  new_visitors: number;
  active_days: number;
}

export interface DayRow {
  date: string;
  page_views: number;
  visits: number;
  unique_visitors: number;
}

export interface PageRow {
  page_url: string;
  views: number;
  visitors: number;
}

export interface BreakdownRow {
  name: string;
  visits: number;
}

export interface MonthRow {
  month_start: string;
  page_views: number;
  visits: number;
  unique_visitors: number;
  new_visitors: number;
  active_days: number;
  avg_daily_visits: number;
  peak_date: string | null;
  peak_visits: number;
  top_page: string | null;
  top_page_views: number;
  /** True while the month is still running, so its figures can change. */
  is_live: boolean;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export function emptyStats(): Stats {
  return { page_views: 0, visits: 0, unique_visitors: 0, new_visitors: 0, active_days: 0 };
}

/** A date at UTC midnight, which is how `visit_date` is stored. */
function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return iso(new Date());
}

/** The first day of the month `value` (a `Y-m-d`) falls in. */
export function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

/** The last day of that month. */
export function monthEnd(value: string): string {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  return iso(new Date(Date.UTC(year, month, 0)));
}

export function addDays(value: string, days: number): string {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

export function addMonths(value: string, months: number): string {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  return `${iso(new Date(Date.UTC(year, month - 1 + months, 1)))}`;
}

/** Headline figures for a date range, both ends included. */
export async function stats(from: string, to: string): Promise<Stats> {
  const rows = await safe(
    () =>
      prisma.$queryRaw<
        {
          page_views: bigint;
          visits: bigint;
          unique_visitors: bigint;
          new_visitors: bigint;
          active_days: bigint;
        }[]
      >`
        SELECT COUNT(*)::bigint AS page_views,
               COUNT(DISTINCT session_id)::bigint AS visits,
               COUNT(DISTINCT visitor_identifier)::bigint AS unique_visitors,
               COUNT(DISTINCT CASE WHEN is_new_visitor THEN visitor_identifier END)::bigint AS new_visitors,
               COUNT(DISTINCT visit_date)::bigint AS active_days
        FROM visitor_logs
        WHERE visit_date BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}`,
    []
  );

  const row = rows[0];
  if (!row) return emptyStats();

  return {
    page_views: Number(row.page_views),
    visits: Number(row.visits),
    unique_visitors: Number(row.unique_visitors),
    new_visitors: Number(row.new_visitors),
    active_days: Number(row.active_days),
  };
}

/** One entry per day of the range — days with no visits included as zeros. */
export async function daily(from: string, to: string): Promise<DayRow[]> {
  const days: DayRow[] = [];
  for (let date = from, guard = 0; date <= to && guard < 1000; date = addDays(date, 1), guard++) {
    days.push({ date, page_views: 0, visits: 0, unique_visitors: 0 });
  }

  const rows = await safe(
    () =>
      prisma.$queryRaw<
        { visit_date: Date; page_views: bigint; visits: bigint; unique_visitors: bigint }[]
      >`
        SELECT visit_date,
               COUNT(*)::bigint AS page_views,
               COUNT(DISTINCT session_id)::bigint AS visits,
               COUNT(DISTINCT visitor_identifier)::bigint AS unique_visitors
        FROM visitor_logs
        WHERE visit_date BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}
        GROUP BY visit_date`,
    []
  );

  const byDate = new Map(rows.map((row) => [iso(row.visit_date), row]));
  return days.map((day) => {
    const row = byDate.get(day.date);
    return row
      ? {
          date: day.date,
          page_views: Number(row.page_views),
          visits: Number(row.visits),
          unique_visitors: Number(row.unique_visitors),
        }
      : day;
  });
}

/** Visits per hour of one day, used when a single day is selected. */
export async function hourly(date: string): Promise<DayRow[]> {
  const hours: DayRow[] = Array.from({ length: 24 }, (_, hour) => ({
    date: String(hour).padStart(2, '0'),
    page_views: 0,
    visits: 0,
    unique_visitors: 0,
  }));

  const rows = await safe(
    () =>
      prisma.$queryRaw<
        { hr: number; page_views: bigint; visits: bigint; unique_visitors: bigint }[]
      >`
        SELECT EXTRACT(HOUR FROM visit_time)::int AS hr,
               COUNT(*)::bigint AS page_views,
               COUNT(DISTINCT session_id)::bigint AS visits,
               COUNT(DISTINCT visitor_identifier)::bigint AS unique_visitors
        FROM visitor_logs
        WHERE visit_date = ${dateOnly(date)}
        GROUP BY 1`,
    []
  );

  for (const row of rows) {
    const hour = hours[row.hr];
    if (!hour) continue;
    hour.page_views = Number(row.page_views);
    hour.visits = Number(row.visits);
    hour.unique_visitors = Number(row.unique_visitors);
  }
  return hours;
}

export async function topPages(from: string, to: string, limit = 10): Promise<PageRow[]> {
  const capped = Math.max(1, Math.min(50, limit));
  const rows = await safe(
    () =>
      prisma.$queryRaw<{ page_url: string; views: bigint; visitors: bigint }[]>`
        SELECT page_url,
               COUNT(*)::bigint AS views,
               COUNT(DISTINCT visitor_identifier)::bigint AS visitors
        FROM visitor_logs
        WHERE visit_date BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}
        GROUP BY page_url
        ORDER BY views DESC, page_url ASC
        LIMIT ${capped}`,
    []
  );

  return rows.map((row) => ({
    page_url: row.page_url,
    views: Number(row.views),
    visitors: Number(row.visitors),
  }));
}

/** Visits split by device or by browser, busiest first. */
export async function breakdown(
  column: 'device_type' | 'browser',
  from: string,
  to: string
): Promise<BreakdownRow[]> {
  const rows = await safe(
    () =>
      column === 'device_type'
        ? prisma.$queryRaw<{ name: string; visits: bigint }[]>`
            SELECT device_type::text AS name, COUNT(DISTINCT session_id)::bigint AS visits
            FROM visitor_logs
            WHERE visit_date BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}
            GROUP BY device_type
            ORDER BY visits DESC, name ASC`
        : prisma.$queryRaw<{ name: string; visits: bigint }[]>`
            SELECT browser AS name, COUNT(DISTINCT session_id)::bigint AS visits
            FROM visitor_logs
            WHERE visit_date BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}
            GROUP BY browser
            ORDER BY visits DESC, name ASC`,
    []
  );

  return rows.map((row) => ({ name: row.name, visits: Number(row.visits) }));
}

/** Roughly how many visitors are on the site now. */
export async function online(): Promise<number> {
  const since = new Date(Date.now() - ONLINE_MINUTES * 60 * 1000);
  const rows = await safe(
    () =>
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT visitor_identifier)::bigint AS n
        FROM visitor_logs
        WHERE created_at >= ${since}`,
    []
  );
  return rows[0] ? Number(rows[0].n) : 0;
}

/** The first recorded page view, or null when nothing has been recorded yet. */
export async function firstDate(): Promise<string | null> {
  const row = await safe(
    () => prisma.visitorLog.aggregate({ _min: { visit_date: true } }),
    { _min: { visit_date: null } }
  );
  return row._min.visit_date ? iso(row._min.visit_date) : null;
}

function emptyMonth(start: string): MonthRow {
  return {
    month_start: start,
    page_views: 0,
    visits: 0,
    unique_visitors: 0,
    new_visitors: 0,
    active_days: 0,
    avg_daily_visits: 0,
    peak_date: null,
    peak_visits: 0,
    top_page: null,
    top_page_views: 0,
    is_live: false,
  };
}

/** Figures for one month, computed from the log. */
export async function computeMonth(start: string): Promise<MonthRow> {
  const today = todayIso();
  const end = monthEnd(start);
  if (start > today) return emptyMonth(start);

  const to = end < today ? end : today;
  const [figures, days] = await Promise.all([stats(start, to), daily(start, to)]);
  const top = figures.page_views > 0 ? await topPages(start, to, 1) : [];

  // The busiest day is the one with most visits; on a tie the earlier day wins.
  let peakDate: string | null = null;
  let peakVisits = 0;
  for (const day of days) {
    if (day.visits > peakVisits) {
      peakDate = day.date;
      peakVisits = day.visits;
    }
  }

  return {
    ...emptyMonth(start),
    ...figures,
    avg_daily_visits: days.length > 0 ? Math.round((figures.visits / days.length) * 100) / 100 : 0,
    peak_date: peakDate,
    peak_visits: peakVisits,
    top_page: top[0]?.page_url ?? null,
    top_page_views: top[0]?.views ?? 0,
    // A month that has not finished is still changing.
    is_live: end >= monthStart(today),
  };
}

/**
 * Saves a snapshot for every **completed** month that has none yet.
 *
 * `createMany` with `skipDuplicates` is the `INSERT IGNORE` of the original: an
 * existing snapshot is never overwritten, so running this on every page view is
 * harmless.
 */
export async function finalizeMonths(): Promise<number> {
  const first = await firstDate();
  if (first === null) return 0;

  const cutoff = monthStart(todayIso()); // this month is still running
  const saved = await safe(
    () => prisma.visitorMonthlySummary.findMany({ select: { month_start: true } }),
    []
  );
  const done = new Set(saved.map((row) => iso(row.month_start)));

  let written = 0;
  for (let month = monthStart(first), guard = 0; month < cutoff && guard < 240; month = addMonths(month, 1), guard++) {
    if (done.has(month)) continue;

    const row = await computeMonth(month);
    try {
      await prisma.visitorMonthlySummary.createMany({
        data: [
          {
            month_start: dateOnly(month),
            page_views: row.page_views,
            visits: row.visits,
            unique_visitors: row.unique_visitors,
            new_visitors: row.new_visitors,
            active_days: row.active_days,
            avg_daily_visits: row.avg_daily_visits,
            peak_date: row.peak_date !== null ? dateOnly(row.peak_date) : null,
            peak_visits: row.peak_visits,
            top_page: row.top_page,
            top_page_views: row.top_page_views,
          },
        ],
        skipDuplicates: true,
      });
      written += 1;
    } catch {
      // A month that cannot be snapshotted is still computed live below.
    }
  }
  return written;
}

/**
 * Every month between two months, newest first.
 *
 * A completed month comes from its snapshot; the current one is computed live,
 * because it is still changing.
 */
export async function months(fromMonth: string, toMonth: string): Promise<MonthRow[]> {
  const current = monthStart(todayIso());

  const saved = await safe(
    () =>
      prisma.visitorMonthlySummary.findMany({
        where: { month_start: { gte: dateOnly(fromMonth), lte: dateOnly(toMonth) } },
      }),
    []
  );
  const byMonth = new Map(saved.map((row) => [iso(row.month_start), row]));

  const out: MonthRow[] = [];
  for (let month = fromMonth, guard = 0; month <= toMonth && guard < 240; month = addMonths(month, 1), guard++) {
    const row = byMonth.get(month);

    if (row && month < current) {
      out.push({
        month_start: month,
        page_views: row.page_views,
        visits: row.visits,
        unique_visitors: row.unique_visitors,
        new_visitors: row.new_visitors,
        active_days: row.active_days,
        avg_daily_visits: Number(row.avg_daily_visits),
        peak_date: row.peak_date ? iso(row.peak_date) : null,
        peak_visits: row.peak_visits,
        top_page: row.top_page,
        top_page_views: row.top_page_views,
        is_live: false,
      });
    } else {
      out.push(await computeMonth(month));
    }
  }

  return out.reverse();
}

/** Totals over the whole history, for the summary cards. */
export async function totals(): Promise<{ visitors: number; views: number; visits: number }> {
  const rows = await safe(
    () =>
      prisma.$queryRaw<{ visitors: bigint; views: bigint; visits: bigint }[]>`
        SELECT COUNT(DISTINCT visitor_identifier)::bigint AS visitors,
               COUNT(*)::bigint AS views,
               COUNT(DISTINCT session_id)::bigint AS visits
        FROM visitor_logs`,
    []
  );
  const row = rows[0];
  return {
    visitors: row ? Number(row.visitors) : 0,
    views: row ? Number(row.views) : 0,
    visits: row ? Number(row.visits) : 0,
  };
}

/** Course titles for the `/courses/?id=N` paths in a list, by path. */
export async function courseTitles(paths: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  const ids = [
    ...new Set(
      paths
        .map((path) => /\?id=(\d+)$/.exec(path)?.[1])
        .filter((id): id is string => id !== undefined)
        .map((id) => Number(id))
    ),
  ];
  if (ids.length === 0) return labels;

  const courses = await safe(
    () =>
      prisma.course.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, name_bn: true },
      }),
    []
  );

  for (const path of paths) {
    const id = Number(/\?id=(\d+)$/.exec(path)?.[1] ?? 0);
    const course = courses.find((row) => row.id === id);
    if (course) labels.set(path, course.name);
  }

  return labels;
}
