import { cn } from '@/lib/cn';

/**
 * Tables that survive a phone.
 *
 * Orbit's lists are wide — a student row carries id, name, batch, phone, status
 * and actions — and most of its users are on a phone. The wrapper scrolls
 * horizontally rather than letting the page scroll sideways, and `priority` marks
 * the columns worth keeping visible when there is no room.
 */

export function TableWrap({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('-mx-px overflow-x-auto', className)}>
      <div className="min-w-full align-middle">{children}</div>
    </div>
  );
}

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>;
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-surface-2 text-xs uppercase tracking-wide text-ink-muted">{children}</thead>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line-soft">{children}</tbody>;
}

export function Tr({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition hover:bg-surface-2/60', className)} {...rest}>
      {children}
    </tr>
  );
}

export function Th({
  className,
  // Named `alignment`, not `align`: <th align> is a real (deprecated) HTML
  // attribute with its own narrower type, and reusing the name collides with it.
  alignment = 'start',
  numeric,
  children,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  alignment?: 'start' | 'center' | 'end';
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-4 py-3 font-semibold',
        alignment === 'end' && 'text-end',
        alignment === 'center' && 'text-center',
        alignment === 'start' && 'text-start',
        numeric && 'tabular-nums',
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  alignment = 'start',
  numeric,
  children,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  alignment?: 'start' | 'center' | 'end';
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-ink',
        alignment === 'end' && 'text-end',
        alignment === 'center' && 'text-center',
        numeric && 'tabular-nums',
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/**
 * The row that fills an empty table.
 *
 * `colSpan` must match the header, otherwise the cell does not stretch and the
 * table looks broken rather than empty.
 */
export function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-ink-muted">
        {children}
      </td>
    </tr>
  );
}
