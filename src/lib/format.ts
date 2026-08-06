import type { Decimal } from "@/generated/prisma/internal/prismaNamespace";

type Numeric = Decimal | number | string | null | undefined;

/**
 * Prisma returns Decimal columns as Decimal objects, not numbers. Everything
 * that renders money goes through here so the conversion happens in one place.
 */
export function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

const BDT = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
});

export function formatCurrency(value: Numeric): string {
  return BDT.format(toNumber(value));
}

export function formatNumber(value: Numeric): string {
  return new Intl.NumberFormat("en-US").format(toNumber(value));
}

const DATE_FORMATS = {
  short: { day: "numeric", month: "short", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
  datetime: { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
  time: { hour: "numeric", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export function formatDate(
  value: Date | string | null | undefined,
  variant: keyof typeof DATE_FORMATS = "short",
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", DATE_FORMATS[variant]).format(date);
}

/** "2026-08" — the key format used by Payment.paymentMonth. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" → "August 2026" */
export function formatMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

/** "09:00" → "9:00 AM" */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function percentage(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
