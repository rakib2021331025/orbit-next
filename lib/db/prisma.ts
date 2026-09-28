import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * One PrismaClient per process, not per request.
 *
 * On Vercel each function instance is reused between invocations, and a new
 * client per request would open a new pool every time and exhaust the
 * database's connections under load. In development Next.js reloads modules on
 * every edit, which has the same effect, so the instance is parked on
 * globalThis there.
 *
 * DATABASE_URL should point at the Neon pooler WITHOUT `pgbouncer=true`: Neon's
 * PgBouncer supports prepared statements, and the flag made Prisma wrap every
 * query in BEGIN/DEALLOCATE ALL/COMMIT — four round trips instead of one
 * (measured: 1374 ms vs 312 ms per query from Bangladesh to us-east-2).
 * connection_limit=5:
 * on Vercel Fluid compute one instance serves several requests at once, and a
 * pool of 1 would queue them all behind each other. The pooler multiplexes
 * thousands of client connections onto a small server-side pool, so 5 per
 * instance does not exhaust Postgres;
 * DIRECT_URL is the unpooled connection Prisma Migrate needs.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Slow-query logging.
 *
 * ORBIT_SLOW_QUERY_MS sets the threshold; in development it defaults to 500 ms,
 * in production it is OFF unless set — every query event costs a little, and
 * full SQL in production logs is noise at best. Only the SQL text and duration
 * are logged, never the parameters: those carry phone numbers and names.
 *
 * A slow query found here should go through EXPLAIN ANALYZE on Neon before an
 * index is added for it (docs/SCHEMA_AUDIT.md).
 */
const slowMs = Number(
  process.env.ORBIT_SLOW_QUERY_MS ?? (process.env.NODE_ENV === 'development' ? 500 : 0)
);

function createClient(): PrismaClient {
  const base: ('warn' | 'error')[] = process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'];
  if (!(slowMs > 0)) return new PrismaClient({ log: base });

  const client = new PrismaClient({
    log: [...base, { emit: 'event', level: 'query' }],
  }) as PrismaClient<{ log: [{ emit: 'event'; level: 'query' }] }>;
  client.$on('query', (event) => {
    if (event.duration >= slowMs) {
      console.warn(`[slow query] ${event.duration} ms  ${event.query.replace(/\s+/g, ' ').slice(0, 500)}`);
    }
  });
  return client as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
