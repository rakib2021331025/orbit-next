import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A single KPI tile. `tone` only shifts the icon chip — the number itself stays
 * in the default foreground colour so a row of tiles reads as one system rather
 * than a set of competing colours.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "positive" | "warning" | "critical";
}) {
  const toneClass = {
    default: "bg-muted text-muted-foreground",
    positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground truncate text-sm font-medium">
            {label}
          </p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
