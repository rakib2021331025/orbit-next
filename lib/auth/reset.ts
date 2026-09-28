import 'server-only';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { getTranslator } from '@/lib/i18n';
import { hashPassword } from './password';
import { clientIp } from '@/lib/security/throttle';
import { forgetUser } from './remember';

/**
 * Password reset, from includes/password_reset.php.
 *
 * Five properties matter here, and all five are the original's:
 *
 *   1. **Only a hash of the token is stored.** The plain token exists once, in
 *      the emailed link. A dump of `password_resets` cannot be used to reset
 *      anybody's password.
 *   2. **Issuing a new token retires the old ones**, so an older email cannot
 *      resurrect a reset the user has already replaced.
 *   3. **The token is claimed inside a transaction** with `used_at IS NULL`. Two
 *      simultaneous submissions of the same link cannot both succeed — the
 *      second matches zero rows.
 *   4. **Rate limited** to 5 per account per hour, so the form cannot be used to
 *      flood somebody's inbox.
 *   5. **The caller is never told whether an address exists.** The page says "if
 *      an account exists at that address, we have sent a link" either way.
 *
 * A student's token is keyed to `student_login.id`, not `students.id`, because
 * that is the row holding the password.
 */

const TTL_MINUTES = 60;
const MAX_PER_HOUR = 5;

export type ResetUserType = 'admin' | 'teacher' | 'student';

export interface ResetAccount {
  user_type: ResetUserType;
  /** admins.id / teachers.id / **student_login.id**. */
  user_id: number;
  email: string;
  name: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * The account behind an email address, searched admin → teacher → student.
 *
 * A student with no `student_login` row cannot be reset: that row is what holds
 * the password, so there is nothing to change.
 */
export async function findAccountByEmail(email: unknown): Promise<ResetAccount | null> {
  const address = String(email ?? '').trim();
  if (address === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) return null;

  try {
    const admin = await prisma.admin.findFirst({
      where: { email: address },
      select: { id: true, email: true },
    });
    if (admin) {
      return { user_type: 'admin', user_id: admin.id, email: admin.email, name: 'Administrator' };
    }
  } catch {
    // Requires database configuration.
  }

  try {
    const teacher = await prisma.teacher.findFirst({
      where: { email: address },
      select: { id: true, email: true, name: true },
    });
    if (teacher) {
      return { user_type: 'teacher', user_id: teacher.id, email: teacher.email, name: teacher.name };
    }
  } catch {
    /* as above */
  }

  try {
    const login = await prisma.studentLogin.findFirst({
      where: { student: { email: address } },
      orderBy: { id: 'desc' },
      select: { id: true, student: { select: { email: true, name: true } } },
    });
    if (login) {
      return {
        user_type: 'student',
        // student_login.id — the row that holds the hash.
        user_id: login.id,
        email: login.student.email,
        name: login.student.name,
      };
    }
  } catch {
    /* as above */
  }

  return null;
}

/**
 * Issues a reset token.
 *
 * Returns the PLAIN token for the emailed link — it is never stored and cannot be
 * recovered afterwards — or null when the hourly limit is reached.
 */
export async function requestPasswordReset(account: ResetAccount): Promise<string | null> {
  try {
    const recent = await prisma.passwordReset.count({
      where: {
        user_type: account.user_type,
        user_id: account.user_id,
        created_at: { gt: new Date(Date.now() - 3_600_000) },
      },
    });
    if (recent >= MAX_PER_HOUR) return null;
  } catch {
    // A counting failure must not block a legitimate reset.
  }

  try {
    // Retire this account's earlier unused tokens: only the newest link works.
    await prisma.passwordReset.updateMany({
      where: { user_type: account.user_type, user_id: account.user_id, used_at: null },
      data: { used_at: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    await prisma.passwordReset.create({
      data: {
        user_type: account.user_type,
        user_id: account.user_id,
        email: account.email,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + TTL_MINUTES * 60_000),
        request_ip: (await clientIp()).slice(0, 45),
      },
    });
    return token;
  } catch {
    return null;
  }
}

/** The reset row behind a token, or null when it is unusable. */
export async function validateResetToken(token: unknown) {
  const value = String(token ?? '').trim();
  // 32 bytes of hex. Reject anything malformed before touching the database.
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;

  try {
    const row = await prisma.passwordReset.findFirst({
      where: { token_hash: sha256(value.toLowerCase()) },
    });
    if (!row || row.used_at !== null || row.expires_at <= new Date()) return null;

    // The lookup is already by an indexed hash; comparing again in constant time
    // costs nothing and closes the gap if that ever changes.
    const a = Buffer.from(row.token_hash);
    const b = Buffer.from(sha256(value.toLowerCase()));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return row;
  } catch {
    return null;
  }
}

export interface ResetOutcome {
  ok: boolean;
  error: string;
}

/** The password policy: length first, and no rule stack that produces "Password1!". */
export async function passwordStrengthError(password: string): Promise<string | null> {
  const { t } = await getTranslator();

  if (password.length < 8) return t('auth.pw.min');
  if (password.length > 200) return t('auth.pw.max');
  if (!/[A-Za-z]/.test(password)) return t('auth.pw.letter');
  if (!/\d/.test(password)) return t('auth.pw.number');

  const common = ['password', '12345678', 'password1', 'admin123', 'qwerty123', 'orbit123'];
  if (common.includes(password.toLowerCase())) return t('auth.pw.common');

  return null;
}

export async function completePasswordReset(
  token: unknown,
  newPassword: string
): Promise<ResetOutcome> {
  const { t } = await getTranslator();

  const weak = await passwordStrengthError(newPassword);
  if (weak !== null) return { ok: false, error: weak };

  const row = await validateResetToken(token);
  if (!row) return { ok: false, error: t('auth.reset.bad_body') };

  const hash = await hashPassword(newPassword);

  try {
    return await prisma.$transaction(async (tx) => {
      // Claim the token inside the transaction. `used_at: null` means two
      // simultaneous submissions of the same link cannot both succeed.
      const claimed = await tx.passwordReset.updateMany({
        where: { id: row.id, used_at: null, expires_at: { gt: new Date() } },
        data: { used_at: new Date() },
      });
      if (claimed.count === 0) {
        return { ok: false, error: t('auth.reset.bad_body') };
      }

      let updated = 0;
      if (row.user_type === 'admin') {
        updated = (await tx.admin.updateMany({ where: { id: row.user_id }, data: { password_hash: hash } })).count;
      } else if (row.user_type === 'teacher') {
        updated = (await tx.teacher.updateMany({ where: { id: row.user_id }, data: { password_hash: hash } })).count;
      } else if (row.user_type === 'student') {
        // `student_login.password` holds the hash despite the column name, and a
        // chosen password also clears the temporary-password flag.
        updated = (
          await tx.studentLogin.updateMany({
            where: { id: row.user_id },
            data: { password: hash, must_change_password: false },
          })
        ).count;
      } else {
        throw new Error('unknown account type');
      }

      if (updated === 0) {
        // The account was deleted between the request and the reset.
        throw new Error('account gone');
      }

      // Any other outstanding token for this account is now stale.
      await tx.passwordReset.updateMany({
        where: { user_type: row.user_type, user_id: row.user_id, used_at: null },
        data: { used_at: new Date() },
      });

      return { ok: true, error: '' };
    });
  } catch {
    return { ok: false, error: t('auth.reset.failed') };
  } finally {
    // Every remembered device is revoked, which is what the confirmation screen
    // promises ("you have been signed out on all devices").
    await forgetUser(row.user_type, row.user_id).catch(() => {});
  }
}

/** Removes expired and spent tokens. No cron, so it runs opportunistically. */
export async function cleanupPasswordResets(): Promise<void> {
  if (Math.random() > 0.05) return;
  try {
    await prisma.passwordReset.deleteMany({
      where: {
        OR: [
          { expires_at: { lt: new Date(Date.now() - 86_400_000) } },
          { used_at: { lt: new Date(Date.now() - 86_400_000) } },
        ],
      },
    });
  } catch {
    // Not fatal.
  }
}
