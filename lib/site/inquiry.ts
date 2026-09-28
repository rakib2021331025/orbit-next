import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getTranslator } from '@/lib/i18n';
import { normaliseBdPhone } from '@/lib/auth/phone';
import { signToken, verifyToken } from '@/lib/security/token';
import { throttleStatus, throttleHit, clientIp } from '@/lib/security/throttle';
import { publicCourses } from './courses';
import {
  HONEYPOT_FIELD,
  PREFERRED_TIMES,
  INQUIRY_SOURCES,
  emptyInquiryState,
  type InquiryState,
} from './inquiry-form';

export { HONEYPOT_FIELD, PREFERRED_TIMES, INQUIRY_SOURCES, emptyInquiryState, type InquiryState };

/**
 * "Call me back" enquiries, from includes/inquiry_lib.php.
 *
 * This form is open to the internet with no login, so it carries four layers of
 * spam defence, and each one catches something the others miss:
 *
 *   1. **Honeypot** — a field a person never sees. Catches naive bots for free.
 *   2. **A signed form token** carrying the time the form was served. Catches a
 *      bot that posts without ever fetching the form, and one that fills it in
 *      under three seconds.
 *   3. **Throttling** — 3 per phone number per day, 10 per IP per hour.
 *   4. **Deduplication** — an open enquiry from the same number within 7 days is
 *      UPDATED rather than duplicated, so the office sees one row per person
 *      instead of five.
 *
 * Nothing here trusts the course id: it is re-read from the active course list.
 */

const MIN_SECONDS = 3;
const TOKEN_TTL = 6 * 3600;
const PHONE_LIMIT = 3; // per 24 hours
const IP_LIMIT = 10; // per hour
const DUP_DAYS = 7;


function isPreferredTime(value: unknown): boolean {
  return (PREFERRED_TIMES as readonly string[]).includes(String(value ?? ''));
}

function isSource(value: unknown): boolean {
  return (INQUIRY_SOURCES as readonly string[]).includes(String(value ?? ''));
}


/** A fresh token for a form about to be rendered. */
export function inquiryFormToken(): string {
  return signToken('inquiry_form', { t: Math.floor(Date.now() / 1000) }, TOKEN_TTL);
}

/** Collapses whitespace and strips control characters from a single line. */
function cleanLine(value: unknown, max: number): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Keeps paragraph breaks, drops control characters. */
function cleanText(value: unknown): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export async function submitInquiry(formData: FormData): Promise<InquiryState> {
  const { t } = await getTranslator();

  const old = {
    name: cleanLine(formData.get('name'), 200),
    phone: String(formData.get('phone') ?? '').trim().slice(0, 30),
    course_id: Math.max(0, Number(formData.get('course_id') ?? 0) || 0),
    preferred_time: isPreferredTime(formData.get('preferred_time'))
      ? String(formData.get('preferred_time'))
      : 'any',
    message: cleanText(formData.get('message')).slice(0, 1000),
  };
  const source = isSource(formData.get('source')) ? String(formData.get('source')) : 'page';

  const state: InquiryState = { ...emptyInquiryState, old, errors: {} };

  // 1. Honeypot. A person never sees this field, so anything in it is a bot.
  if (String(formData.get(HONEYPOT_FIELD) ?? '').trim() !== '') {
    await throttleHit('inquiry', `spam:${await clientIp()}`);
    // Reported as success: telling a bot it was caught only helps it adapt.
    return { ...state, result: 'spam' };
  }

  // 2. The signed form token: genuine, unexpired, and not filled instantly.
  const token = verifyToken('inquiry_form', formData.get('form_token'));
  if (token === null) {
    return { ...state, general: t('inquiry.err_expired') };
  }
  const servedAt = Number(token.t ?? 0);
  if (Math.floor(Date.now() / 1000) - servedAt < MIN_SECONDS) {
    return { ...state, general: t('inquiry.err_too_fast') };
  }

  // 3. Fields.
  const phone = normaliseBdPhone(old.phone);
  const errors: Record<string, string> = {};
  if (old.name === '') {
    errors.name = t('inquiry.err_name');
  } else if (old.name.length > 100) {
    errors.name = t('inquiry.err_name_long');
  }
  if (old.phone === '') {
    errors.phone = t('inquiry.err_phone_required');
  } else if (phone === null) {
    errors.phone = t('inquiry.err_phone');
  }

  // The course is re-read from the active list; a stale or forged id is refused
  // rather than stored as a name the office cannot act on.
  let course: { id: number; name: string } | null = null;
  if (old.course_id > 0) {
    const courses = await publicCourses();
    const match = courses.find((row) => row.id === old.course_id);
    if (!match) {
      errors.course_id = t('inquiry.err_course');
    } else {
      course = { id: match.id, name: match.name };
    }
  }
  if (old.message.length > 500) {
    errors.message = t('inquiry.err_message_long');
  }
  if (Object.keys(errors).length > 0) {
    return { ...state, errors };
  }

  // 4. Throttling: per IP per hour, and per phone per day.
  let ipLocked = false;
  try {
    const since = new Date(Date.now() - 3_600_000);
    const count = await prisma.loginAttempt.count({
      where: { scope: 'inquiry', ip: await clientIp(), attempted_at: { gt: since } },
    });
    ipLocked = count >= IP_LIMIT;
  } catch {
    ipLocked = false;
  }
  const phoneLock = await throttleStatus('inquiry', phone, PHONE_LIMIT, Number.MAX_SAFE_INTEGER, 24 * 60);
  if (ipLocked || phoneLock.locked) {
    return { ...state, general: t('inquiry.err_throttle') };
  }
  await throttleHit('inquiry', phone);

  const message = old.message !== '' ? old.message : null;

  try {
    // 5. An open enquiry from this number in the last week is updated, not
    //    duplicated — five calls about the same student is one conversation.
    const existing = await prisma.inquiry.findFirst({
      where: {
        phone: phone!,
        status: { in: ['new', 'called'] },
        created_at: { gte: new Date(Date.now() - DUP_DAYS * 86_400_000) },
      },
      orderBy: { id: 'desc' },
    });

    if (existing) {
      const additions: string[] = [];
      if (course && existing.course_id !== course.id) additions.push(`(${course.name})`);
      if (message !== null && !(existing.message ?? '').includes(message)) additions.push(message);

      let updated = existing.message ?? '';
      if (additions.length > 0) {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        updated = `${updated}\n[${stamp}] ${additions.join(' ')}`.trim();
      }

      await prisma.inquiry.update({
        where: { id: existing.id },
        data: {
          // COALESCE: a course recorded earlier is not overwritten by a later
          // enquiry that named none.
          course_id: existing.course_id ?? course?.id ?? null,
          course_name: existing.course_name ?? course?.name ?? null,
          preferred_time: old.preferred_time,
          message: updated !== '' ? updated.slice(0, 5000) : null,
          updated_at: new Date(),
        },
      });
      return { ...state, result: 'updated' };
    }

    await prisma.inquiry.create({
      data: {
        name: old.name,
        phone: phone!,
        course_id: course?.id ?? null,
        course_name: course?.name ?? null,
        preferred_time: old.preferred_time,
        message,
        source,
        status: 'new',
        lang: (await getTranslator()).lang,
        ip: await clientIp(),
      },
    });
    return { ...state, result: 'created' };
  } catch {
    // Requires database configuration.
    return { ...state, general: t('error.generic') };
  }
}

/** Courses offered in the enquiry form's picker. */
export async function inquiryCourses() {
  const courses = await publicCourses();
  return courses.map((course) => ({ id: course.id, name: course.name, name_bn: course.name_bn }));
}
