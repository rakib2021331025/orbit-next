'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setActiveBranch } from '@/lib/branch/actions';

/**
 * The branch switcher for an all-branch admin.
 *
 * A `<select>` that submits on change, as the original does. It posts to a server
 * action rather than reloading with `?branch=`, so the parameter stays out of the
 * URL — which matters because `?branch=` is reserved across the admin area and a
 * page's own filters would have to work around it.
 */
export function BranchPicker({
  branches,
  activeId,
  allLabel,
  label,
}: {
  branches: { id: number; name: string }[];
  activeId: number;
  allLabel: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <select
        defaultValue={String(activeId)}
        disabled={pending}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          startTransition(async () => {
            await setActiveBranch(next, pathname);
            // The page's data was filtered on the server by the previous branch.
            router.refresh();
          });
        }}
        className="rounded-orbit border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
      >
        <option value="0">{allLabel}</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  );
}
