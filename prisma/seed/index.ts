/**
 * Reference data for a FRESH development database: `npm run db:seed`.
 *
 * This is what Orbit/database_setup.php and the schema runner leave behind on
 * a brand-new install, and nothing more:
 *
 *  - the first super admin, only when `admins` is empty (database_setup.php:
 *    ORBIT_ADMIN_EMAIL / ORBIT_ADMIN_PASSWORD, here SEED_ADMIN_EMAIL /
 *    SEED_ADMIN_PASSWORD);
 *  - the main branch, only when `branches` is empty (migrate_2036.sql). The app
 *    assumes one exists: lib/branch/assign.ts files every new student, batch
 *    and application under mainBranchId(), and 0 is not a branch;
 *  - the app_schema_version marker (row id 1), so a database seeded here says
 *    the same thing as one imported from MySQL.
 *
 * Deliberately NOT seeded:
 *  - site_settings: every reader in lib/settings falls back to a default when a
 *    key is missing, exactly as orbit_setting() does, and the admin Settings
 *    page writes the rows on first save;
 *  - the three demo courses database_setup.php inserts. They point at image
 *    files that do not exist in object storage and would have to be deleted by
 *    hand before going live.
 *
 * Every step checks first, so running it twice changes nothing. Do not run it
 * before `npm run import:mysql` on a database you intend to import into: the
 * import keeps the original ids, and a seeded admin or branch would take id 1.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../lib/auth/password';
import { env, loadEnv } from './env';

/** ORBIT_SCHEMA_VERSION in Orbit/includes/schema_upgrade.php when this schema was converted. */
const LEGACY_SCHEMA_VERSION = 2041;

loadEnv();
const prisma = new PrismaClient();

async function seedAdmin(): Promise<void> {
  if ((await prisma.admin.count()) > 0) {
    console.log('admins      already has rows — skipped');
    return;
  }

  const email = env('SEED_ADMIN_EMAIL', 'admin@orbitprivatecare.com').toLowerCase();
  let password = env('SEED_ADMIN_PASSWORD');
  const generated = password === '';
  if (generated) {
    // Same rule as database_setup.php: never a known default password. The
    // PHP original wrote the generated one to the error log; a CLI prints it
    // once to the person who ran the command.
    password = randomBytes(9).toString('base64url');
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
  }

  await prisma.admin.create({
    data: {
      name: 'Super Admin',
      email,
      password_hash: await hashPassword(password),
      role: 'super_admin',
      status: 'active',
      // A super admin is not tied to a branch; lib/auth/guards.ts only locks a
      // branch_admin to its branch_id.
      branch_id: null,
    },
  });

  console.log(`admins      created super admin ${email}`);
  if (generated) {
    console.log(`            generated password: ${password}`);
    console.log('            sign in and change it now (Admin → Admins).');
  }
}

async function seedMainBranch(): Promise<void> {
  if ((await prisma.branch.count()) > 0) {
    console.log('branches    already has rows — skipped');
    return;
  }
  // migrate_2036.sql's first branch. Address, phone and email were copied from
  // Settings there; a fresh database has no settings yet, so they stay empty
  // and are filled in from Admin → Branches.
  await prisma.branch.create({
    data: {
      name_bn: 'রংপুর প্রধান শাখা',
      name_en: 'Rangpur Main Branch',
      slug: 'rangpur',
      status: 'active',
      is_main: true,
      sort_order: 1,
    },
  });
  console.log('branches    created the main branch (rangpur)');
}

async function seedSchemaVersion(): Promise<void> {
  const existing = await prisma.appSchemaVersion.findUnique({ where: { id: 1 } });
  if (existing) {
    console.log(`app_schema_version already ${existing.version} — skipped`);
    return;
  }
  await prisma.appSchemaVersion.create({ data: { id: 1, version: LEGACY_SCHEMA_VERSION } });
  console.log(`app_schema_version set to ${LEGACY_SCHEMA_VERSION}`);
}

async function main(): Promise<void> {
  await seedAdmin();
  await seedMainBranch();
  await seedSchemaVersion();
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
