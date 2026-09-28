import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db/prisma';

/**
 * Attempt throttling, from includes/security.php.
 *
 * Failures are counted twice — per identifier and per IP — and both matter:
 * per-identifier alone lets an attacker lock a real user out of their own
 * account; per-IP alone lets them walk a list of accounts one guess at a time.
 *
 * Identifiers are stored as a SHA-256 hash, so the table never holds a username,
 * a phone number or a Student ID in the clear.
 *
 * Every function swallows its errors. The original logs and continues rather
 * than locking the whole centre out over a counting failure, and a throttle
 * that fails closed on a missing table would do exactly that.
 */

export interface ThrottleStatus {
  locked: boolean;
  minutes: number;
}

/** The caller's IP, as the proxy reports it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return (forwarded?.split(',')[0] || h.get('x-real-ip') || '0.0.0.0').trim().slice(0, 45);
}

function identifierHash(value: unknown): string {
  return createHash('sha256')
    .update(String(value ?? '').trim().toLowerCase())
    .digest('hex');
}

export async function throttleStatus(
  scope: string,
  identifier: unknown,
  maxPerIdentifier = 5,
  maxPerIp = 25,
  windowMinutes = 15
): Promise<ThrottleStatus> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  try {
    const ip = await clientIp();
    const [byIdentifier, byIp] = await Promise.all([
      prisma.loginAttempt.count({
        where: { scope, identifier_hash: identifierHash(identifier), attempted_at: { gt: since } },
      }),
      prisma.loginAttempt.count({ where: { ip, attempted_at: { gt: since } } }),
    ]);
    if (byIdentifier >= maxPerIdentifier || byIp >= maxPerIp) {
      return { locked: true, minutes: windowMinutes };
    }
  } catch {
    // Table missing before the upgrade — never block on it.
  }
  return { locked: false, minutes: 0 };
}

export async function throttleHit(scope: string, identifier: unknown): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        scope,
        identifier_hash: identifierHash(identifier),
        ip: await clientIp(),
        attempted_at: new Date(),
      },
    });
    // Shared hosting had no cron, so the original sweeps opportunistically
    // (1 in 50). Keeping that here means the table cannot grow without bound
    // however the app is deployed.
    if (Math.random() < 0.02) {
      await prisma.loginAttempt.deleteMany({
        where: { attempted_at: { lt: new Date(Date.now() - 86_400_000) } },
      });
    }
  } catch {
    // Logging a failed attempt must never break the response.
  }
}

export async function throttleClear(scope: string, identifier: unknown): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({
      where: { scope, identifier_hash: identifierHash(identifier) },
    });
  } catch {
    // Not fatal.
  }
}
