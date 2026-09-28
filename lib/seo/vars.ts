import 'server-only';
import { allSettings } from '@/lib/settings';
import type { Lang } from '@/lib/i18n';

/**
 * `{brand}`, `{brand_bn}` and `{city}` — the placeholders the lang files use for
 * brand wording, from orbit_seo_vars().
 *
 * Every public title and description passes through these, so the brand name is
 * edited in Admin → Settings rather than in 40 translation strings, and Google
 * sees one consistent name in both languages.
 */
export async function seoVars(lang: Lang): Promise<Record<string, string>> {
  const settings = await allSettings();

  const brand = (settings.institute_name ?? '').trim() || 'Orbit Private Care';
  const brandBn = (settings.institute_name_bn ?? '').trim() || brand;
  const city = await seoCity(lang);

  return {
    brand,
    brand_bn: brandBn,
    city: city !== '' ? city : lang === 'bn' ? 'বাংলাদেশ' : 'Bangladesh',
  };
}

/** The first word of the brand — the short name people actually search for. */
export async function seoShortBrand(): Promise<string> {
  const settings = await allSettings();
  const brand = (settings.institute_name ?? '').trim() || 'Orbit Private Care';
  return brand.split(/\s+/)[0] ?? brand;
}

/**
 * The locality from the institute's address.
 *
 * The address is one free-text field, so the town is taken as the second-to-last
 * comma-separated part — "House 4, Road 2, Rangpur 5400, Bangladesh" → "Rangpur".
 * A guess, but the same guess the original makes, and it only ever feeds a
 * meta description.
 */
async function seoCity(lang: Lang): Promise<string> {
  const settings = await allSettings();
  const address =
    (lang === 'bn' ? (settings.institute_address_bn ?? '') : (settings.institute_address ?? '')).trim() ||
    (settings.institute_address ?? '').trim();
  if (address === '') return '';

  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];

  // Drop a trailing country, then strip a postcode from what is left.
  const candidate = parts[parts.length - 2];
  return candidate.replace(/\s*\d{4,}\s*$/, '').trim();
}
