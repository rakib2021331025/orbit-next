'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isLang, LANG_COOKIE, type Lang } from '@/lib/i18n';
import { readSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * The language switcher, as lang.php does it: remember the choice in a cookie,
 * and when someone is signed in, against their account as well so it follows
 * them to another device.
 */
export async function setLanguage(lang: string, redirectTo?: string): Promise<void> {
  if (!isLang(lang)) return;

  const store = await cookies();
  store.set(LANG_COOKIE, lang, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    // Not httpOnly: the choice is not a secret, and the theme/language toggles
    // read it client-side to avoid a flash of the wrong language.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  });

  await saveLanguagePreference(lang);

  // Everything on the page is translated server-side, so the cache for this path
  // is no longer correct.
  revalidatePath(redirectTo && redirectTo.startsWith('/') ? redirectTo : '/');
}

/**
 * Stores the choice in user_preferences for a signed-in user.
 *
 * Failing quietly is right here: a preference that did not save is a small
 * annoyance, and the cookie has already taken effect. Refusing to switch the
 * language over it would be worse.
 */
async function saveLanguagePreference(lang: Lang): Promise<void> {
  const session = await readSession();
  if (!session) return;

  try {
    await prisma.userPreference.upsert({
      where: { user_type_user_id: { user_type: session.role, user_id: session.uid } },
      update: { lang },
      create: { user_type: session.role, user_id: session.uid, lang },
    });
  } catch {
    /* the cookie is already set; the account-level copy is a convenience */
  }
}
