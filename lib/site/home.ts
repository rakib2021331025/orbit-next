import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { cached, TAGS } from '@/lib/cache';
import { allSettings, settingLocalized, setting } from '@/lib/settings';
import { type Lang } from '@/lib/i18n';

/**
 * Everything the home page reads.
 *
 * Each loader swallows its own errors and returns an empty list. The home page
 * is the one page that must render on a half-configured install: a missing
 * `gifts` table should hide the gift section, not take the site down.
 *
 * All the limits are the original's, and they exist for a reason it learned the
 * hard way — rendering every review made the page grow without bound (300
 * reviews was 600 KB of HTML).
 */

/** Promotions whose start/end window covers right now, for one position. */
/**
 * Cached for five minutes: a promotion's start/end window is honoured to within
 * that, which the office can live with in exchange for not querying on every view.
 */
const loadPromotions = cached(
  async (position: string, limit: number) => {
      const now = new Date();
      const rows = await prisma.promotion.findMany({
        where: {
          is_active: true,
          display_position: position as never,
          // The window is checked here rather than in the query's date maths so
          // it stays exact to the second.
          AND: [
            { OR: [{ start_at: null }, { start_at: { lte: now } }] },
            { OR: [{ end_at: null }, { end_at: { gte: now } }] },
          ],
        },
        orderBy: [{ sort_order: 'asc' }, { id: 'desc' }],
        take: Math.max(1, Math.min(50, limit)),
      });
      return rows;
  },
  ['site:promotions'],
  { tags: [TAGS.home], revalidate: 300 }
);

export const activePromotions = cache(async (position: string, limit = 12) => {
  try {
    return await loadPromotions(position, limit);
  } catch {
    return [];
  }
});

/** Free gifts with admission. The section is hidden when none is active. */
const loadGifts = cached(
  (limit: number) =>
    prisma.gift.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'desc' }],
      take: Math.max(1, Math.min(24, limit)),
    }),
  ['site:gifts'],
  { tags: [TAGS.home], revalidate: 3600 }
);

export const activeGifts = cache(async (limit = 6) => {
  try {
    return await loadGifts(limit);
  } catch {
    return [];
  }
});

export interface SiteStats {
  courses: number;
  students: number;
  batches: number;
  teachers: number;
  results: number;
}

/** The five counts in the "numbers" strip. */
/** Five counts of whole tables — ten minutes stale is invisible on a marketing strip. */
const loadStats = cached(
  async (): Promise<SiteStats> => {
    const [courses, students, batches, teachers, results] = await Promise.all([
      prisma.course.count({ where: { status: 'active' } }),
      prisma.student.count({ where: { status: 'approved' } }),
      prisma.batch.count({ where: { status: 'active' } }),
      prisma.teacher.count({ where: { status: 'active' } }),
      prisma.monthlyExam.count({ where: { status: 'published' } }),
    ]);
    return { courses, students, batches, teachers, results };
  },
  ['site:stats'],
  { tags: [TAGS.home, TAGS.stats], revalidate: 600 }
);

export const siteStats = cache(async (): Promise<SiteStats> => {
  try {
    return await loadStats();
  } catch {
    return { courses: 0, students: 0, batches: 0, teachers: 0, results: 0 };
  }
});

/** The four list sections, with the original's caps. */
/**
 * Each section still fails on its own (a missing table hides one section), so
 * this may cache a partly empty result — for ten minutes at most, and any admin
 * change to these tables drops it at once.
 */
const loadHomeSections = cached(async () => {
  const safe = async <T,>(run: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await run();
    } catch {
      return [];
    }
  };

  const [feedbacks, gallery, trial, achievements] = await Promise.all([
    safe(() =>
      prisma.feedback.findMany({
        where: { status: 'approved' },
        orderBy: { id: 'desc' },
        take: 12,
        select: { id: true, name: true, course_name: true, rating: true, feedback: true },
      })
    ),
    safe(() =>
      prisma.gallery.findMany({
        where: { status: 'active' },
        orderBy: { created_at: 'desc' },
        take: 24,
        select: { id: true, title: true, image: true, category: true },
      })
    ),
    safe(() =>
      prisma.trialClass.findMany({
        where: { status: 'active' },
        orderBy: { id: 'desc' },
        take: 3,
      })
    ),
    safe(() =>
      prisma.achievement.findMany({ orderBy: { created_at: 'desc' }, take: 20 })
    ),
  ]);

  return { feedbacks, gallery, trial, achievements };
}, ['site:home-sections'], { tags: [TAGS.home, TAGS.gallery], revalidate: 600 });

export const homeSections = cache(() => loadHomeSections());

/** The director block, or null when no name is configured. */
export async function teamDirector(lang: Lang) {
  const settings = await allSettings();
  const name = (settings.director_name ?? '').trim();
  const nameBn = (settings.director_name_bn ?? '').trim();
  if (name === '' && nameBn === '') return null;

  return {
    name: lang === 'bn' && nameBn !== '' ? nameBn : name !== '' ? name : nameBn,
    // In English, the Bangla name is shown underneath when both exist.
    nameAlt: lang !== 'bn' && nameBn !== '' && name !== '' ? nameBn : '',
    designation: await settingLocalized('director_designation', '', lang),
    education: await settingLocalized('director_education', '', lang),
    experience: await settingLocalized('director_experience', '', lang),
    bio: await settingLocalized('director_bio', '', lang),
    message: await settingLocalized('director_message', '', lang),
    email: (settings.director_email ?? '').trim(),
    phone: (settings.director_phone ?? '').trim(),
    photo: (settings.director_photo ?? '').trim(),
  };
}

/** Teachers shown on the website, with their subjects. */
const loadTeachers = cached(
  async (branchId: number) => {
    const teachers = await prisma.teacher.findMany({
      where: {
        show_on_website: true,
        status: 'active',
        ...(branchId > 0 ? { branchTeacher_teacher: { some: { branch_id: branchId } } } : {}),
      },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        name_bn: true,
        designation: true,
        designation_bn: true,
        qualification: true,
        qualification_bn: true,
        experience: true,
        experience_bn: true,
        bio: true,
        bio_bn: true,
        photo: true,
        teacherSubject_teacher: { select: { subject: true }, orderBy: { subject: 'asc' } },
      },
    });
    return teachers.map((teacher) => ({
      ...teacher,
      subjects: teacher.teacherSubject_teacher.map((row) => row.subject),
    }));
  },
  ['site:teachers'],
  { tags: [TAGS.teachers], revalidate: 3600 }
);

export const teamTeachers = cache(async (branchId = 0) => {
  try {
    return await loadTeachers(branchId);
  } catch {
    // Columns arrive with schema 2034; before that the section has no teachers.
    return [];
  }
});

/** The website developer credit, or null when switched off. */
export async function teamDeveloper(lang: Lang) {
  if ((await setting('developer_show', '1')) !== '1') return null;
  const name = await settingLocalized('developer_name', '', lang);
  if (name === '') return null;

  const settings = await allSettings();
  return {
    name,
    title: await settingLocalized('developer_title', '', lang),
    note: await settingLocalized('developer_note', '', lang),
    email: (settings.developer_email ?? '').trim(),
    phone: (settings.developer_phone ?? '').trim(),
    website: (settings.developer_website ?? '').trim(),
    facebook: (settings.developer_facebook ?? '').trim(),
    photo: (settings.developer_photo ?? '').trim(),
  };
}

/**
 * A YouTube video id from either a bare id or any share/watch/shorts URL.
 * Returns '' for anything else, so a pasted non-YouTube link cannot become an
 * iframe src.
 */
export function youtubeId(value: unknown): string {
  const text = String(value ?? '').trim();
  if (/^[A-Za-z0-9_-]{6,20}$/.test(text)) return text;
  const match = text.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,20})/);
  return match ? match[1] : '';
}
