/**
 * Bangladeshi mobile numbers, normalised exactly as
 * orbit_normalise_bd_phone() does in includes/orbit_settings.php.
 *
 * Guardians sign in with a phone number, and the same person may type
 * 01712345678, +8801712345678 or 0171-234 5678. All three have to reach the one
 * stored row, so the number is reduced to eleven digits before any lookup.
 *
 * Returns null — not '' — when the number is not a valid BD mobile, so a caller
 * cannot accidentally query with an empty string and match a blank column.
 */
export function normaliseBdPhone(input: unknown): string | null {
  let digits = String(input ?? '').replace(/\D+/g, '');

  // Drop a leading 88 country code.
  if (digits.length === 13 && digits.startsWith('88')) {
    digits = digits.slice(2);
  }

  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

/** 01712-345678 — the display form used by orbit_format_phone(). */
export function formatBdPhone(input: unknown): string {
  const digits = normaliseBdPhone(input);
  if (!digits) return String(input ?? '');
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}
