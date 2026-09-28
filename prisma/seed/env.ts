import { existsSync } from 'node:fs';

/**
 * Environment for the command-line scripts in prisma/seed.
 *
 * Next.js loads .env.local and .env for the app, but `tsx prisma/seed/…` runs
 * outside Next, so nothing would be loaded and LEGACY_MYSQL_* / SEED_ADMIN_*
 * would silently be empty. .env.local is read first because it is where the
 * README tells you to put real values; a variable already set in the shell is
 * never overwritten, so `DATABASE_URL=… npm run import:mysql` still wins.
 */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
    } catch (err) {
      console.warn(`Could not read ${file}: ${(err as Error).message}`);
    }
  }
}

export function env(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}
