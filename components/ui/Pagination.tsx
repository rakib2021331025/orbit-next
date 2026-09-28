import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Pagination as links, not buttons.
 *
 * Page two must have its own URL: an admin filters a student list, sends the
 * link to a colleague, and the colleague has to land on the same page. That also
 * makes the browser's back button behave.
 *
 * Labels are passed in, already translated, and `format` renders the numbers —
 * page numbers on a Bangla page are Bangla digits.
 */

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a page, keeping whatever filters are in the URL. */
  hrefFor: (page: number) => string;
  /** `pageOf` is a template: "Page {page} of {pages}", used for the nav's label. */
  labels: { previous: string; next: string; pageOf: string };
  format?: (value: number) => string;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
  labels,
  format = String,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const window = pageWindow(page, totalPages);
  const box =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-orbit border px-3 text-sm font-medium transition';

  return (
    <nav
      aria-label={labels.pageOf
        .replace('{page}', format(page))
        .replace('{pages}', format(totalPages))}
      className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}
    >
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={cn(box, 'border-line bg-surface hover:bg-surface-2')}>
          <span aria-hidden>&larr;</span>
          <span className="ms-1 hidden sm:inline">{labels.previous}</span>
        </Link>
      ) : (
        <span className={cn(box, 'border-line-soft text-ink-muted/50')} aria-hidden>
          &larr;
        </span>
      )}

      {window.map((entry, index) =>
        entry === null ? (
          <span key={`gap-${index}`} className="px-1 text-ink-muted" aria-hidden>
            …
          </span>
        ) : entry === page ? (
          <span
            key={entry}
            aria-current="page"
            className={cn(box, 'border-primary bg-primary text-white')}
          >
            {format(entry)}
          </span>
        ) : (
          <Link
            key={entry}
            href={hrefFor(entry)}
            className={cn(box, 'border-line bg-surface hover:bg-surface-2')}
          >
            {format(entry)}
          </Link>
        )
      )}

      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={cn(box, 'border-line bg-surface hover:bg-surface-2')}>
          <span className="me-1 hidden sm:inline">{labels.next}</span>
          <span aria-hidden>&rarr;</span>
        </Link>
      ) : (
        <span className={cn(box, 'border-line-soft text-ink-muted/50')} aria-hidden>
          &rarr;
        </span>
      )}
    </nav>
  );
}

/**
 * First page, last page, and two either side of the current one; `null` is a gap.
 * Keeps the control a fixed width however many pages there are, which matters on
 * a phone where 40 page links would wrap into a wall.
 */
function pageWindow(page: number, total: number): (number | null)[] {
  const keep = new Set<number>([1, total, page]);
  for (let offset = 1; offset <= 2; offset += 1) {
    if (page - offset >= 1) keep.add(page - offset);
    if (page + offset <= total) keep.add(page + offset);
  }

  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) out.push(null);
    out.push(value);
    previous = value;
  }
  return out;
}

/** "Showing 1–20 of 134" — the sentence beside a paginated list. */
export function ResultCount({
  from,
  to,
  total,
  template,
  format = String,
}: {
  from: number;
  to: number;
  total: number;
  /** e.g. "Showing {from}–{to} of {total}", from the catalogue. */
  template: string;
  format?: (value: number) => string;
}) {
  const text = template
    .replace('{from}', format(from))
    .replace('{to}', format(to))
    .replace('{total}', format(total));
  return <p className="text-sm text-ink-muted">{text}</p>;
}
