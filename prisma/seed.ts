import "dotenv/config";
import bcrypt from "bcryptjs";

import { prisma } from "../src/lib/prisma";

/**
 * Baseline seed: the first admin plus the reference data the UI needs to be
 * navigable (courses, batches, subjects, gallery categories).
 *
 * Unlike the legacy `database_setup.php` — which hardcoded the admin password
 * in source and re-ran on every HTTP request — credentials come from the
 * environment and this script is run explicitly via `npm run db:seed`.
 */

const DEFAULT_SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology", "English", "ICT"];

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    throw new Error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding.",
    );
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", isActive: true },
    create: {
      email,
      name: "Administrator",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`✓ admin ready: ${admin.email}`);

  // --- Courses, batches and subjects ---------------------------------------
  const courses = [
    {
      name: "SSC General Math Batch",
      slug: "ssc-general-math",
      description:
        "Complete syllabus preparation for SSC general mathematics with regular exam reviews.",
    },
    {
      name: "HSC Physics Premium Batch",
      slug: "hsc-physics-premium",
      description:
        "In-depth lectures on kinematics, thermodynamics, electricity and modern physics.",
    },
    {
      name: "Chemistry Basic to Advanced",
      slug: "chemistry-basic-to-advanced",
      description:
        "Mastering organic, inorganic and physical chemistry with a practical focus.",
    },
  ];

  for (const [index, course] of courses.entries()) {
    const created = await prisma.course.upsert({
      where: { slug: course.slug },
      update: {},
      create: { ...course, sortOrder: index },
    });

    await prisma.batch.upsert({
      where: { courseId_name: { courseId: created.id, name: "Batch A" } },
      update: {},
      create: {
        courseId: created.id,
        name: "Batch A",
        academicYear: String(new Date().getFullYear()),
      },
    });

    for (const subject of DEFAULT_SUBJECTS) {
      await prisma.subject.upsert({
        where: { courseId_name: { courseId: created.id, name: subject } },
        update: {},
        create: { courseId: created.id, name: subject },
      });
    }
  }
  console.log(`✓ ${courses.length} courses with batches and subjects`);

  // --- Gallery categories ---------------------------------------------------
  // Seeded as a convenience only. Unlike the legacy hardcoded <select>, admins
  // can add, rename and delete these freely from the dashboard.
  const categories = ["Events", "Classroom", "Awards", "Celebrations", "Seminars"];
  for (const [index, name] of categories.entries()) {
    await prisma.galleryCategory.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name), sortOrder: index },
    });
  }
  console.log(`✓ ${categories.length} gallery categories`);

  // --- Site settings --------------------------------------------------------
  const settings: Record<string, string> = {
    "site.name": "Orbit Private Care",
    "site.tagline": "Guiding every student into orbit",
    "site.email": email,
    "site.phone": "",
    "site.address": "",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  console.log(`✓ site settings`);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
