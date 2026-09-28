import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Which child a guardian is looking at, when more than one is linked.
 *
 * Plain links, so each child has a shareable URL and the back button works.
 * The id in the URL is still resolved against this guardian's own children on the
 * server — it selects, it does not permit.
 */
export function ChildSwitcher({
  childrenList,
  activeId,
  switchTo,
  label,
}: {
  childrenList: { id: number; name: string; course: string }[];
  activeId: number | null;
  /** The section to stay in when switching, e.g. `/guardian/attendance`. */
  switchTo: string;
  label: string;
}) {
  if (childrenList.length < 2) return null;

  const base = switchTo.replace(/\/$/, '') || '/guardian';

  return (
    <div className="rounded-orbit border border-line-soft bg-surface px-4 py-3 shadow-orbit">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {childrenList.map((child) => {
          const current = child.id === activeId;
          return (
            <Link
              key={child.id}
              href={`${base}?student=${child.id}`}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-orbit border px-3 py-1.5 text-sm transition',
                current
                  ? 'border-primary bg-primary-soft font-medium text-primary-text'
                  : 'border-line bg-surface text-ink hover:bg-surface-2'
              )}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                {child.name.trim().charAt(0) || '?'}
              </span>
              <span>{child.name}</span>
              <span className="text-xs text-ink-muted">{child.course}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
