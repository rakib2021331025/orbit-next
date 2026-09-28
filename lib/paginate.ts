/**
 * Pagination arithmetic, from orbit_paginate().
 *
 * `page` is clamped into range rather than trusted: `?page=-1` and
 * `?page=999999` both arrive from bots and from people editing URLs, and an
 * unclamped OFFSET turns the first into a database error and the second into an
 * empty page that looks like data loss.
 */
export interface Pager {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  offset: number;
  from: number;
  to: number;
}

export function paginate(total: number, perPage: number, requestedPage: unknown): Pager {
  const size = Math.max(1, Math.floor(perPage));
  const count = Math.max(0, Math.floor(total));
  const totalPages = Math.max(1, Math.ceil(count / size));

  const asked = Number(requestedPage);
  const page = Math.min(Math.max(Number.isFinite(asked) ? Math.floor(asked) : 1, 1), totalPages);

  const offset = (page - 1) * size;
  return {
    page,
    perPage: size,
    total: count,
    totalPages,
    offset,
    from: count === 0 ? 0 : offset + 1,
    to: Math.min(offset + size, count),
  };
}

/**
 * Builds a page link that keeps the filters already in the URL.
 *
 * Dropping them is the classic pagination bug: page 2 of a search silently
 * becomes page 2 of everything.
 */
export function pageHref(
  basePath: string,
  current: Record<string, string | undefined>,
  page: number
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value !== undefined && value !== '' && key !== 'page') params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query === '' ? basePath : `${basePath}?${query}`;
}
