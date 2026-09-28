import 'server-only';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { invalidate, TAGS } from '@/lib/cache';

/**
 * Writing site settings, from orbit_setting_save() and
 * orbit_settings_save_many().
 *
 * Many settings are read by the **public** pages — the institute name, the bKash
 * number, the contact details — so saving one has to drop the caches that hold
 * them. In the PHP that is `orbit_cache_flush('pub.')`; here it is a revalidation
 * of the public routes, which is the same idea in this framework's terms.
 *
 * `saveSettings` writes several in one transaction, so a half-saved form cannot
 * leave the site showing a new bKash number beside the old Nagad one.
 */

/** Public routes that read settings and therefore go stale when one changes. */
function flushPublic(): void {
  // The shared data cache first (lib/cache): every page reads settings from it.
  invalidate(TAGS.settings);
  for (const path of ['/', '/courses', '/branches', '/apply', '/inquiry', '/notices', '/results']) {
    revalidatePath(path);
  }
}

export async function saveSetting(key: string, value: string): Promise<boolean> {
  try {
    await prisma.siteSetting.upsert({
      where: { setting_key: key },
      create: { setting_key: key, setting_value: value },
      update: { setting_value: value },
    });
  } catch {
    return false;
  }
  flushPublic();
  return true;
}

export async function saveSettings(values: Record<string, string>): Promise<boolean> {
  const entries = Object.entries(values);
  if (entries.length === 0) return true;

  try {
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.siteSetting.upsert({
          where: { setting_key: key },
          create: { setting_key: key, setting_value: value },
          update: { setting_value: value },
        })
      )
    );
  } catch {
    return false;
  }
  flushPublic();
  return true;
}
