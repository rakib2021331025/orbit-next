/**
 * URL and phone helpers for values that came out of the database.
 *
 * Settings, promotions and notices all hold admin-entered links, and those end
 * up in `href`. An unchecked `href` is an XSS vector — `javascript:` in a promo
 * button runs on every visitor's page — so every stored link goes through
 * `safeUrl()` first, exactly as orbit_safe_url() does.
 */

/**
 * An absolute URL for a path in this app.
 *
 * Emails, password links and sitemaps all need one, and they are generated on
 * the server where there is no browser origin to borrow. `NEXT_PUBLIC_APP_URL` is
 * the app's own address; a relative link in an email simply does not work.
 */
export function absoluteUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/${String(path ?? '').replace(/^\/+/, '')}`;
}

/** A link that is safe to render, or '' when it is not. */
export function safeUrl(input: unknown): string {
  const url = String(input ?? '').trim();
  if (url === '') return '';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(url)) return '';

  if (/^https?:\/\//i.test(url)) {
    try {
      new URL(url);
      return url;
    } catch {
      return '';
    }
  }

  if (/^(mailto|tel):/i.test(url)) return url;
  if (url.startsWith('#')) return url;

  if (url.startsWith('/')) {
    // `//host` and `/\host` are protocol-relative: they leave the site while
    // looking like an internal path.
    return url[1] === '/' || url[1] === '\\' ? '' : url;
  }

  // A relative page in this site. No scheme, and no characters that could
  // introduce one.
  if (/^[A-Za-z0-9_\-./]+(\?[^#\s]*)?(#\S*)?$/.test(url) && !url.includes(':')) {
    return `/${url.replace(/^\.?\//, '')}`;
  }
  return '';
}

/** "01712345678" → "01712-345678". Anything else is returned unchanged. */
export function formatPhone(input: unknown): string {
  const number = String(input ?? '').trim();
  const digits = number.replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('01')) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return number;
}

export function telHref(input: unknown): string {
  const number = String(input ?? '').trim();
  if (number === '') return '';
  const plus = number.startsWith('+') ? '+' : '';
  return `tel:${plus}${number.replace(/\D+/g, '')}`;
}

/** "01712345678" → "8801712345678" for wa.me, or '' when unusable. */
export function whatsappNumber(input: unknown): string {
  let digits = String(input ?? '').replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('01')) digits = `88${digits}`;
  return /^8801[3-9]\d{8}$/.test(digits) ? digits : '';
}

export function whatsappUrl(input: unknown, text = ''): string {
  const number = whatsappNumber(input);
  if (number === '') return '';
  return `https://wa.me/${number}${text !== '' ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** A Google Maps search link for an address, when no explicit map URL is set. */
export function mapSearchUrl(address: string): string {
  const query = address.trim();
  if (query === '') return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
