'use server';

import { cookies } from 'next/headers';
import { readSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/**
 * The server half of the theme toggle — ajax/set_theme.php.
 *
 * It works for guests (cookie only) and for signed-in users (cookie plus
 * user_preferences, so the choice follows them to another device).
 */

export type Theme = 'light' | 'dark';

export async function saveThemePreference(theme: string): Promise<void> {
  if (theme !== 'light' && theme !== 'dark') return;

  const store = await cookies();
  store.set('orbit_theme', theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    // Readable by script on purpose: the toggle and the pre-paint script both
    // need it, and a theme name is not a secret.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  });

  const session = await readSession();
  if (!session) return;

  try {
    await prisma.userPreference.upsert({
      where: { user_type_user_id: { user_type: session.role, user_id: session.uid } },
      update: { theme },
      create: { user_type: session.role, user_id: session.uid, theme },
    });
  } catch {
    // The cookie has already taken effect; the account-level copy is a
    // convenience, not something worth failing the request over.
  }
}
