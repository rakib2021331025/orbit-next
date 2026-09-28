import 'server-only';
import { cookies } from 'next/headers';

/**
 * The theme to render on the server for this request.
 *
 * Kept out of actions.ts: everything exported from a `'use server'` module
 * becomes a callable endpoint, and a plain read has no business being one.
 */
export type Theme = 'light' | 'dark';

export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get('orbit_theme')?.value;
  return value === 'dark' ? 'dark' : 'light';
}
