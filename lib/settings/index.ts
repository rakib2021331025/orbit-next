import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { cached, TAGS } from '@/lib/cache';
import { getLang, type Lang } from '@/lib/i18n';

/**
 * site_settings, the key/value table behind almost every public page.
 *
 * The whole table is read once per request and memoised with React's `cache()`,
 * which is what orbit_settings_all()'s static memo does in PHP. A header, a
 * footer and three sections of the home page each asking for one key would
 * otherwise be four round trips for a table of a few dozen rows.
 *
 * A missing table returns an empty map rather than throwing: the public site
 * should still render on an install where the schema runner has not caught up.
 */

export type Settings = Record<string, string>;

/**
 * Also kept in the shared cache (lib/cache) for an hour: every page of every
 * portal reads settings, and they change only when an admin saves the Settings
 * page — which drops the entry (lib/settings/save.ts).
 */
const loadSettings = cached(
  async (): Promise<Settings> => {
    const rows = await prisma.siteSetting.findMany({
      select: { setting_key: true, setting_value: true },
    });
    const out: Settings = {};
    for (const row of rows) out[row.setting_key] = row.setting_value ?? '';
    return out;
  },
  ['site:settings'],
  { tags: [TAGS.settings], revalidate: 3600 }
);

export const allSettings = cache(async (): Promise<Settings> => {
  try {
    return await loadSettings();
  } catch {
    return {};
  }
});

/** One setting, or `fallback` when it is missing OR empty. */
export async function setting(key: string, fallback = ''): Promise<string> {
  const value = (await allSettings())[key];
  return value === undefined || value === '' ? fallback : value;
}

/** True when a setting holds a usable value — use it to decide whether to render
 *  an optional block at all, rather than rendering an empty shell. */
export async function settingFilled(key: string): Promise<boolean> {
  return (await setting(key, '')).trim() !== '';
}

export async function settingNumber(key: string, fallback: number): Promise<number> {
  const value = Number(await setting(key, ''));
  return Number.isFinite(value) ? value : fallback;
}

export async function settingFlag(key: string, fallback = false): Promise<boolean> {
  const value = await setting(key, '');
  if (value === '') return fallback;
  return value === '1';
}

/**
 * A setting in the reader's language: `<key>_bn` in Bangla, `<key>` otherwise,
 * falling back to whichever is filled — orbit_setting_localized().
 */
export async function settingLocalized(key: string, fallback = '', lang?: Lang): Promise<string> {
  const language = lang ?? (await getLang());
  if (language === 'bn') {
    const bn = (await setting(`${key}_bn`, '')).trim();
    if (bn !== '') return bn;
  }
  return setting(key, fallback);
}

/** The institute's name, as every header, title and email signature shows it. */
export async function instituteName(lang?: Lang): Promise<string> {
  return settingLocalized('institute_name', 'Orbit Private Care', lang);
}

/** The number a visitor is told to call. Falls back to the general contact number. */
export async function helplineNumber(): Promise<string> {
  const helpline = (await setting('helpline_number', '')).trim();
  return helpline !== '' ? helpline : (await setting('contact_phone', '')).trim();
}
