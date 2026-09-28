/**
 * The pure half of the i18n layer: no cookies, no server-only import, so a
 * client component can use it if it must.
 *
 * It deliberately does NOT load the catalogues. Both JSON files together are
 * several hundred kilobytes, and shipping them to the browser to translate a
 * handful of labels would be a poor trade — server components translate and pass
 * the finished strings down as props.
 */
/** The two interface languages, as orbit_languages() lists them. */
export type Lang = 'bn' | 'en';

/* ------------------------------------------------------------------ numbers */

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Latin digits → Bangla digits, as orbit_digits() does. */
export function toLocalDigits(value: string | number, lang: Lang): string {
  const text = String(value ?? '');
  if (lang !== 'bn') return text;
  return text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function formatNumber(value: number, decimals: number, lang: Lang): string {
  const grouped = Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return toLocalDigits(grouped, lang);
}

/** "৳3,000" — whole taka without decimals, otherwise two places. */
export function formatMoney(amount: number | null | undefined, lang: Lang): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '';
  const value = Number(amount);
  const decimals = Math.floor(value) === value ? 0 : 2;
  return `৳${formatNumber(value, decimals, lang)}`;
}

/* -------------------------------------------------------------------- dates */

/** The date() formats the PHP pages actually pass. */
export type DateFormat =
  | 'd M Y'
  | 'd F Y'
  | 'F Y'
  | 'M Y'
  | 'd M'
  | 'l, d M Y'
  | 'd/m/Y'
  | 'Y-m-d'
  | 'h:i A'
  | 'd M Y, h:i A'
  | 'd M, h:i A';

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];
// Sunday first, as Date.getDay() numbers them.
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

/**
 * Formats a date in the active language.
 *
 * `'0000-00-00'` returns '' — MySQL's zero date arrives from the legacy data and
 * must not be shown as 30 November -0001, which is what a naive parse gives.
 */
export function formatDate(
  value: Date | string | null | undefined,
  format: DateFormat,
  lang: Lang
): string {
  if (value === null || value === undefined || value === '' || value === '0000-00-00') return '';

  const date =
    value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '';

  const bn = lang === 'bn';
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours12 = date.getHours() % 12 || 12;
  const meridiem = date.getHours() < 12 ? (bn ? 'এএম' : 'AM') : bn ? 'পিএম' : 'PM';

  const parts: Record<string, string> = {
    d: pad(date.getDate()),
    j: String(date.getDate()),
    m: pad(date.getMonth() + 1),
    Y: String(date.getFullYear()),
    F: (bn ? MONTHS_BN : MONTHS_EN)[date.getMonth()],
    // 'M' is the short month; Bangla has no separate short form, as
    // orbit_bn_date_words() shows by mapping 'Jan' and 'January' alike.
    M: bn ? MONTHS_BN[date.getMonth()] : MONTHS_EN[date.getMonth()].slice(0, 3),
    l: (bn ? DAYS_BN : DAYS_EN)[date.getDay()],
    h: pad(hours12),
    i: pad(date.getMinutes()),
    A: meridiem,
  };

  const out = format.replace(/[djmYFMlhiA]/g, (token) => parts[token] ?? token);
  return bn ? toLocalDigits(out, 'bn') : out;
}

/** "September 2026" / "সেপ্টেম্বর ২০২৬" from a YYYY-MM string. */
export function monthLabel(yearMonth: string, lang: Lang): string {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth;
  return formatDate(`${yearMonth}-01`, 'F Y', lang);
}

/* -------------------------------------------------------- bilingual columns */

/**
 * Picks the right language of a bilingual database column.
 *
 * In Bangla `<field>_bn` wins when filled; in English the base column wins.
 * Either way an empty preferred version falls back to the other, so a course
 * entered in only one language still shows something rather than a blank.
 */
export function pickLocalized(row: object, field: string, lang: Lang): string {
  // `object`, not `Record<string, unknown>`: the rows passed in are interfaces and
  // Prisma result types, and an interface has no index signature, so the stricter
  // constraint rejects every real caller.
  const source = row as Record<string, unknown>;
  const base = String(source[field] ?? '').trim();
  const bn = String(source[`${field}_bn`] ?? '').trim();
  if (lang === 'bn') return bn !== '' ? bn : base;
  return base !== '' ? base : bn;
}

/**
 * The other bilingual column convention in this schema: `<field>_bn` beside
 * `<field>_en`, with no unsuffixed column. `branches` and `courses` use it, while
 * `students` and `teachers` use `<field>` + `<field>_bn`.
 *
 * Both exist in the live database, so both need a helper — reading a branch with
 * pickLocalized() returns an empty string, silently, because `name` is not a
 * column there.
 */
export function pickPair(row: object, field: string, lang: Lang): string {
  const source = row as Record<string, unknown>;
  const bn = String(source[`${field}_bn`] ?? '').trim();
  const en = String(source[`${field}_en`] ?? '').trim();
  if (lang === 'bn') return bn !== '' ? bn : en;
  return en !== '' ? en : bn;
}

/**
 * An English weekday name as stored in `class_routine.day_of_week`, translated.
 *
 * The column holds "Saturday", "Sunday", … in English whatever the interface
 * language, so it is a lookup rather than a translation key. Unknown input is
 * returned unchanged — better a English day name than a blank cell.
 */
export function dayName(day: unknown, lang: Lang): string {
  const index = DAYS_EN.findIndex(
    (name) => name.toLowerCase() === String(day ?? '').trim().toLowerCase()
  );
  if (index === -1) return String(day ?? '');
  return (lang === 'bn' ? DAYS_BN : DAYS_EN)[index];
}

/**
 * The teaching week, Saturday first.
 *
 * This is the Bangladeshi school week; a Monday-first calendar would put the
 * first teaching day in the middle of the list. The names match what
 * `class_routine.day_of_week` stores.
 */
export const TEACHING_WEEK = [
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
] as const;

/** Today's name in the same spelling the column uses. */
export function todayName(): string {
  return DAYS_EN[new Date().getDay()];
}
