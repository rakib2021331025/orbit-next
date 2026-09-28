import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { paginate, type Pager } from '@/lib/paginate';
import { normaliseBdPhone } from '@/lib/auth/phone';

/**
 * The admission inquiry list, from admin/inquiries.php.
 *
 * These are call-back requests, so the page is a **work queue** rather than an
 * archive: New and Called are sorted by when the follow-up is due (overdue
 * first, then never-dated), and everything else newest first.
 *
 * Each row is matched against existing applications and students by phone, so
 * whoever picks up the call can see at once that this person already applied.
 */

export const INQUIRY_STATUSES = ['new', 'called', 'admitted', 'not_interested'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export interface InquiryFilters {
  status: InquiryStatus | 'all';
  q: string;
  courseId: number;
  from: string;
  to: string;
  due: boolean;
  page: number;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

function validDate(value: string | undefined): string {
  const text = (value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? text : '';
}

export function inquiryFilters(params: Record<string, string | undefined>): InquiryFilters {
  const status = params.status ?? 'new';
  return {
    status:
      status === 'all' || (INQUIRY_STATUSES as readonly string[]).includes(status)
        ? (status as InquiryStatus | 'all')
        : 'new',
    q: (params.q ?? '').trim().slice(0, 100),
    courseId: Math.max(0, Number(params.course ?? 0) || 0),
    from: validDate(params.from),
    to: validDate(params.to),
    due: params.due === '1',
    page: Math.max(1, Number(params.page ?? 1) || 1),
  };
}

/** The filters as a query string, for links and the export. */
export function inquiryQuery(
  filters: InquiryFilters,
  extra: Record<string, string> = {}
): string {
  const query = new URLSearchParams();
  if (filters.status !== 'new') query.set('status', filters.status);
  if (filters.q !== '') query.set('q', filters.q);
  if (filters.courseId > 0) query.set('course', String(filters.courseId));
  if (filters.from !== '') query.set('from', filters.from);
  if (filters.to !== '') query.set('to', filters.to);
  if (filters.due) query.set('due', '1');
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query.toString();
}

/** Today at midnight — "due" means on or before today, not "in the last 24h". */
function today(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Everything except the status tab, so the tab counts share one filter. */
function baseWhere(filters: InquiryFilters): Record<string, unknown>[] {
  const and: Record<string, unknown>[] = [];

  if (filters.q !== '') {
    // A phone typed with spaces, dashes or a country code still has to match.
    const digits = filters.q.replace(/\D+/g, '').replace(/^88/, '');
    and.push(
      digits.length >= 3
        ? {
            OR: [
              { name: { contains: filters.q, mode: 'insensitive' } },
              { phone: { contains: digits } },
            ],
          }
        : { name: { contains: filters.q, mode: 'insensitive' } }
    );
  }
  if (filters.courseId > 0) and.push({ course_id: filters.courseId });
  if (filters.from !== '') and.push({ created_at: { gte: new Date(`${filters.from}T00:00:00.000Z`) } });
  if (filters.to !== '') and.push({ created_at: { lte: new Date(`${filters.to}T23:59:59.999Z`) } });
  if (filters.due) {
    and.push({
      follow_up_date: { not: null, lte: today() },
      status: { in: ['new', 'called'] },
    });
  }

  return and;
}

function listWhere(filters: InquiryFilters): Record<string, unknown> {
  const and = baseWhere(filters);
  if (filters.status !== 'all') and.push({ status: filters.status });
  return and.length > 0 ? { AND: and } : {};
}

export async function inquiryCounts(
  filters: InquiryFilters
): Promise<Record<InquiryStatus | 'all', number>> {
  const and = baseWhere(filters);
  const rows = await safe(
    () =>
      prisma.inquiry.groupBy({
        by: ['status'],
        where: and.length > 0 ? { AND: and } : {},
        _count: { _all: true },
      }),
    []
  );

  const counts = {
    new: 0,
    called: 0,
    admitted: 0,
    not_interested: 0,
    all: 0,
  } as Record<InquiryStatus | 'all', number>;

  for (const row of rows) {
    counts[row.status as InquiryStatus] = row._count._all;
    counts.all += row._count._all;
  }
  return counts;
}

export type InquiryRow = Awaited<ReturnType<typeof inquiryList>>['rows'][number];

/**
 * Called rows (and the "due" view) are a queue: the oldest follow-up first,
 * with the undated ones last. Everything else is newest first.
 */
function inquiryOrder(filters: InquiryFilters) {
  return filters.status === 'called' || filters.due
    ? [
        { follow_up_date: { sort: 'asc' as const, nulls: 'last' as const } },
        { updated_at: 'desc' as const },
        { id: 'desc' as const },
      ]
    : [{ created_at: 'desc' as const }, { id: 'desc' as const }];
}

export async function inquiryList(filters: InquiryFilters, total: number) {
  const pager = paginate(total, 20, filters.page);

  const rows = await safe(
    () =>
      prisma.inquiry.findMany({
        where: listWhere(filters),
        orderBy: inquiryOrder(filters),
        take: pager.perPage,
        skip: pager.offset,
      }),
    []
  );

  return { rows, pager };
}

/** The whole filtered list for the CSV, capped so one click cannot exhaust memory. */
export async function inquiryExport(filters: InquiryFilters, limit = 10000) {
  return safe(
    () =>
      prisma.inquiry.findMany({
        where: listWhere(filters),
        orderBy: inquiryOrder(filters),
        take: limit,
      }),
    []
  );
}

/** How many follow-ups are due right now, across every filter. */
export async function inquiriesDue(): Promise<number> {
  return safe(
    () =>
      prisma.inquiry.count({
        where: { follow_up_date: { not: null, lte: today() }, status: { in: ['new', 'called'] } },
      }),
    0
  );
}

export interface PhoneMatch {
  admissions: {
    id: number;
    application_no: string | null;
    fullname: string;
    status: string;
    student_id: number | null;
    created_at: Date;
  }[];
  students: {
    id: number;
    student_id_no: string | null;
    name: string;
    via: 'phone' | 'guardian';
  }[];
}

/** The ways one Bangladeshi number can have been written down. */
function phoneVariants(phone: string): string[] {
  const clean = normaliseBdPhone(phone);
  if (clean === null) return [phone];
  return [clean, `${clean.slice(0, 5)}-${clean.slice(5)}`, `+88${clean}`, `88${clean}`];
}

/**
 * Applications and students already on file for each inquiry phone.
 *
 * Matching on every spelling of the number matters: a lead who applied last
 * week typed `+8801…` there and `01…` here, and calling them as a new lead
 * would be embarrassing.
 */
export async function phoneMatches(phones: string[]): Promise<Map<string, PhoneMatch>> {
  const unique = [...new Set(phones.filter((phone) => phone.trim() !== ''))];
  const map = new Map<string, PhoneMatch>();
  const variantOf = new Map<string, string>();

  for (const phone of unique) {
    map.set(phone, { admissions: [], students: [] });
    for (const variant of phoneVariants(phone)) variantOf.set(variant, phone);
  }
  if (variantOf.size === 0) return map;

  const keys = [...variantOf.keys()];

  const [admissions, students] = await Promise.all([
    safe(
      () =>
        prisma.admission.findMany({
          where: { mobile: { in: keys } },
          orderBy: { id: 'desc' },
          take: 200,
          select: {
            id: true,
            application_no: true,
            fullname: true,
            mobile: true,
            status: true,
            student_id: true,
            created_at: true,
          },
        }),
      []
    ),
    safe(
      () =>
        prisma.student.findMany({
          where: { OR: [{ phone: { in: keys } }, { guardian_phone: { in: keys } }] },
          orderBy: { id: 'desc' },
          take: 200,
          select: {
            id: true,
            student_id_no: true,
            name: true,
            phone: true,
            guardian_phone: true,
          },
        }),
      []
    ),
  ]);

  for (const row of admissions) {
    const phone = variantOf.get(row.mobile);
    const entry = phone !== undefined ? map.get(phone) : undefined;
    if (entry && entry.admissions.length < 3) {
      entry.admissions.push({
        id: row.id,
        application_no: row.application_no,
        fullname: row.fullname,
        status: row.status,
        student_id: row.student_id,
        created_at: row.created_at,
      });
    }
  }

  for (const row of students) {
    // One student can match two inquiry phones — their own and their guardian's.
    const added = new Set<string>();
    for (const [column, via] of [
      ['phone', 'phone'],
      ['guardian_phone', 'guardian'],
    ] as const) {
      const value = (row[column] ?? '').trim();
      const phone = variantOf.get(value);
      const entry = phone !== undefined ? map.get(phone) : undefined;
      if (entry && phone !== undefined && !added.has(phone) && entry.students.length < 4) {
        entry.students.push({
          id: row.id,
          student_id_no: row.student_id_no,
          name: row.name,
          via,
        });
        added.add(phone);
      }
    }
  }

  return map;
}
