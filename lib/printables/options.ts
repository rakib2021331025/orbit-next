/**
 * The printable-document categories and size limit.
 *
 * In their own module because a `'use server'` file may export only async
 * functions — a constant there breaks the build as soon as a server component
 * imports it.
 */

export const PRINTABLE_MAX_MB = 12;

export const PRINTABLE_CATEGORIES = [
  'general',
  'physics',
  'chemistry',
  'biology',
  'mathematics',
  'other',
] as const;

export type PrintableCategory = (typeof PRINTABLE_CATEGORIES)[number];
