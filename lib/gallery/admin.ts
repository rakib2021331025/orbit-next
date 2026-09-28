import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

/**
 * The gallery's categories and images, from admin/gallery_categories.php,
 * admin/gallery_add.php and admin/gallery_manage.php.
 *
 * Two rules here are load-bearing:
 *
 *   1. **A category with images is never deleted.** The images would be
 *      orphaned silently; the admin is told how many there are and moves or
 *      deletes them first.
 *   2. **Renaming a category rewrites `gallery.category`**, the legacy text
 *      column older pages still read, so the two never disagree.
 */

export const MAX_IMAGE_MB = 10;

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** `orbit_slugify()`: letters and digits, everything else a hyphen. */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  if (slug === '') {
    return `c-${createHash('md5').update(text).digest('hex').slice(0, 10)}`;
  }
  return slug.slice(0, 150);
}

/** A slug no other category uses — "SSC 2027" and "SSC-2027" both want `ssc-2027`. */
export async function uniqueSlug(name: string, excludeId: number): Promise<string> {
  const base = slugify(name).slice(0, 150);

  for (let attempt = 1; attempt < 500; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const taken = await safe(
      () =>
        prisma.galleryCategory.count({
          where: { slug, NOT: { id: excludeId } },
        }),
      1
    );
    if (taken === 0) return slug;
  }
  return `${base}-${randomBytes(4).toString('hex')}`;
}

/** The categories in display order, with how many images each holds. */
export async function categoryList() {
  const categories = await safe(
    () =>
      prisma.galleryCategory.findMany({
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      }),
    []
  );

  const counts = await safe(
    () =>
      prisma.gallery.groupBy({
        by: ['category_id'],
        _count: { _all: true },
      }),
    [] as { category_id: number | null; _count: { _all: number } }[]
  );
  const byCategory = new Map(
    counts
      .filter((row) => row.category_id !== null)
      .map((row) => [row.category_id as number, row._count._all])
  );

  return categories.map((category) => ({
    ...category,
    images: byCategory.get(category.id) ?? 0,
  }));
}

/** id → sort_order, in display order. */
async function orderMap(): Promise<Map<number, number>> {
  const rows = await safe(
    () =>
      prisma.galleryCategory.findMany({
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: { id: true, sort_order: true },
      }),
    []
  );
  return new Map(rows.map((row) => [row.id, row.sort_order]));
}

/** Rewrites sort_order to 1..n, touching only the rows whose number changes. */
async function writeOrder(ids: number[], current: Map<number, number>): Promise<void> {
  const changes = ids
    .map((id, index) => ({ id, order: index + 1 }))
    .filter((row) => current.get(row.id) !== row.order);

  if (changes.length === 0) return;

  await prisma.$transaction(
    changes.map((row) =>
      prisma.galleryCategory.update({ where: { id: row.id }, data: { sort_order: row.order } })
    )
  );
}

/**
 * Moves one category up or down.
 *
 * The list is renumbered 1..n in display order **first**, then the two
 * neighbours swap — otherwise nothing happens at all when several categories
 * share one sort_order, which is the bug this replaces.
 */
export async function moveCategory(id: number, direction: 'up' | 'down'): Promise<boolean> {
  const current = await orderMap();
  const ids = [...current.keys()];
  const position = ids.indexOf(id);
  const target = position + (direction === 'up' ? -1 : 1);

  if (position === -1 || target < 0 || target >= ids.length) return false;

  [ids[position], ids[target]] = [ids[target], ids[position]];
  try {
    await writeOrder(ids, current);
    return true;
  } catch {
    return false;
  }
}

/** Renumbers every category 1..n in its current display order. */
export async function renumberCategories(): Promise<boolean> {
  const current = await orderMap();
  try {
    await writeOrder([...current.keys()], current);
    return true;
  } catch {
    return false;
  }
}

/** How many images a category holds, whatever their status. */
export async function categoryImageCount(id: number): Promise<number> {
  return safe(() => prisma.gallery.count({ where: { category_id: id } }), 0);
}

/* -------------------------------------------------------------- images */

export interface ImageFilters {
  /** A category id, or 'none' for the images in no category at all. */
  categoryId: number | 'none';
  status: '' | 'active' | 'inactive';
  featured: boolean;
  q: string;
  page: number;
}

export function imageFilters(params: Record<string, string | undefined>): ImageFilters {
  return {
    categoryId:
      params.category === 'none'
        ? 'none'
        : /^\d{1,9}$/.test(params.category ?? '')
          ? Number(params.category)
          : 0,
    status:
      params.status === 'active' || params.status === 'inactive'
        ? params.status
        : '',
    featured: params.featured === '1',
    q: (params.q ?? '').trim().slice(0, 100),
    page: Math.max(1, Number(params.page ?? 1) || 1),
  };
}

export function imageWhere(filters: ImageFilters): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (filters.categoryId === 'none') and.push({ category_id: null });
  else if (filters.categoryId > 0) and.push({ category_id: filters.categoryId });
  if (filters.status !== '') and.push({ status: filters.status });
  if (filters.featured) and.push({ featured: true });
  if (filters.q !== '') {
    and.push({
      OR: [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
        { category: { contains: filters.q, mode: 'insensitive' } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}
