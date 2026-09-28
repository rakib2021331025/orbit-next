import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { setting, settingNumber, settingFlag } from '@/lib/settings';

/**
 * Rate limiting, fair-share quota and the shared answer cache, from
 * includes/academic_ai_lib.php.
 *
 * The problem this solves: the free Gemini tier allows a fixed number of requests
 * a day for the whole centre, and one enthusiastic student can spend all of them
 * before lunch. Four mechanisms, each doing something the others cannot:
 *
 *   1. **Per-minute limit** — stops hammering.
 *   2. **Per-day limit per student**, but derived: the day's pool divided by the
 *      number of students who can sign in. So the cap adapts as the roll grows
 *      instead of being guessed once.
 *   3. **A shared answer cache.** Thirty students asking "explain photosynthesis"
 *      is one request. Cached answers count towards the MINUTE limit (which exists
 *      to stop hammering) but not the DAY limit (which exists to control spend),
 *      because they cost nothing.
 *   4. **Retention.** Nothing older than the window is served: the syllabus and
 *      the model both move on.
 *
 * Counting is from the database, not the session, so a second tab, cleared cookies
 * or a direct POST change nothing. **A counting error refuses rather than
 * allows** — the gate must not open because a query failed.
 */

export interface AiConfig {
  enabled: boolean;
  perMinute: number;
  perDay: number;
  maxChars: number;
  historyTurns: number;
  historyChars: number;
  dailyPool: number;
  keepDays: number;
  images: boolean;
  imageBytes: number;
  imageMaxPx: number;
}

export async function aiConfig(): Promise<AiConfig> {
  const bounded = async (key: string, fallback: number, min: number, max: number) => {
    const value = await settingNumber(key, fallback);
    return value < min || value > max ? fallback : Math.floor(value);
  };

  return {
    enabled: (await setting('academic_ai_enabled', '0')) === '1',
    perMinute: await bounded('academic_ai_per_minute', 6, 1, 60),
    perDay: await bounded('academic_ai_per_day', 60, 1, 2000),
    maxChars: await bounded('academic_ai_max_chars', 1500, 100, 8000),
    historyTurns: await bounded('academic_ai_history', 8, 0, 30),
    // A hard cap on what the conversation context may cost, not a setting.
    historyChars: 6000,
    dailyPool: await bounded('academic_ai_daily_pool', 60, 0, 100_000),
    keepDays: await bounded('academic_ai_keep_days', 60, 0, 3650),
    // A photo costs several times the tokens of a sentence, so it can be turned
    // off on its own.
    images: await settingFlag('academic_ai_images', true),
    imageBytes: 4 * 1024 * 1024,
    imageMaxPx: 1400,
  };
}

/**
 * One student's share of the day.
 *
 * The pool divided by the students who can actually sign in — approved AND
 * holding a login row. Counting every student row would divide the pool among
 * people who cannot use it.
 */
export async function dailyShare(config: AiConfig): Promise<number> {
  const ceiling = config.perDay;
  if (config.dailyPool <= 0) return ceiling;

  let students = 0;
  try {
    students = await prisma.student.count({
      where: { status: 'approved', studentLogin_student: { some: {} } },
    });
  } catch {
    return ceiling;
  }

  if (students < 1) return ceiling;
  return Math.max(1, Math.min(ceiling, Math.floor(config.dailyPool / students)));
}

export interface RateVerdict {
  allowed: boolean;
  scope: 'minute' | 'day' | '';
  remainingToday: number;
  share: number;
}

export async function rateLimit(studentId: number, config: AiConfig): Promise<RateVerdict> {
  const share = await dailyShare(config);

  try {
    const now = Date.now();
    const [minute, day] = await Promise.all([
      prisma.aiMessage.count({
        where: {
          student_id: studentId,
          role: { in: ['user', 'blocked'] },
          created_at: { gt: new Date(now - 60_000) },
        },
      }),
      prisma.aiMessage.count({
        where: {
          student_id: studentId,
          role: { in: ['user', 'blocked'] },
          created_at: { gt: new Date(now - 86_400_000) },
          // Cached answers cost nothing, so they do not spend the day's budget.
          from_cache: false,
        },
      }),
    ]);

    if (minute >= config.perMinute) {
      return { allowed: false, scope: 'minute', remainingToday: Math.max(0, share - day), share };
    }
    if (day >= share) {
      return { allowed: false, scope: 'day', remainingToday: 0, share };
    }
    return { allowed: true, scope: '', remainingToday: Math.max(0, share - day), share };
  } catch {
    // A counting failure must not open the gate.
    return { allowed: false, scope: 'minute', remainingToday: 0, share };
  }
}

/* ------------------------------------------------------------------- cache */

/**
 * The cache key.
 *
 * Case, spacing and trailing punctuation are normalised — including the Bangla
 * danda `।` — so "Explain photosynthesis." and "explain photosynthesis" are one
 * question rather than two paid requests.
 */
export function cacheKey(question: string, language: string): string {
  const text = question
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.?!।,;:]+$/u, '');
  return createHash('sha256').update(`${language}|${text}`).digest('hex');
}

/** A previously bought answer, or '' when there is none worth reusing. */
export async function cacheGet(key: string, config: AiConfig): Promise<string> {
  try {
    const row = await prisma.aiAnswerCache.findUnique({
      where: { question_hash: key },
      select: { answer: true, created_at: true },
    });
    if (!row) return '';

    // Never serve something older than the retention window.
    if (config.keepDays > 0) {
      const cutoff = Date.now() - config.keepDays * 86_400_000;
      if (row.created_at.getTime() <= cutoff) return '';
    }

    await prisma.aiAnswerCache.update({
      where: { question_hash: key },
      data: { hits: { increment: 1 }, last_used_at: new Date() },
    });
    return row.answer;
  } catch {
    // A missing table (before the upgrade) must not stop an answer.
    return '';
  }
}

/** Keeps an answer for the next student who asks the same thing. */
export async function cachePut(
  key: string,
  question: string,
  answer: string,
  language: string
): Promise<void> {
  try {
    await prisma.aiAnswerCache.upsert({
      where: { question_hash: key },
      update: { answer, last_used_at: new Date() },
      create: {
        question_hash: key,
        question: question.slice(0, 2000),
        answer,
        language,
        last_used_at: new Date(),
      },
    });
  } catch {
    // Not fatal: the answer is already on its way to the student.
  }
}

/** Questions the whole centre has spent on the API in the last 24 hours. */
export async function poolUsed(): Promise<number> {
  try {
    return await prisma.aiMessage.count({
      where: {
        role: 'user',
        from_cache: false,
        created_at: { gt: new Date(Date.now() - 86_400_000) },
      },
    });
  } catch {
    return 0;
  }
}
