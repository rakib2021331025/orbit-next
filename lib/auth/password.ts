import bcrypt from 'bcryptjs';

/**
 * Password checking that accepts the hashes the PHP app already stored.
 *
 * PHP's password_hash() writes bcrypt with a `$2y$` prefix; bcryptjs writes and
 * expects `$2a$`/`$2b$`. The three are the same algorithm with the same output —
 * only the version byte differs — so a `$2y$` hash is rewritten to `$2a$` before
 * comparing. Without this every existing student, teacher, guardian and admin
 * would be locked out on the day of the cutover, with a password that is in fact
 * correct.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const hash = (stored ?? '').trim();
  if (!plain || !hash) return false;

  if (hash.startsWith('$2y$') || hash.startsWith('$2b$') || hash.startsWith('$2a$')) {
    const normalised = hash.startsWith('$2y$') ? `$2a$${hash.slice(4)}` : hash;
    try {
      return await bcrypt.compare(plain, normalised);
    } catch {
      return false;
    }
  }

  // Anything else is a hash format this app never produced. Refusing is the
  // only safe answer: a plaintext or md5 column must be re-hashed, not trusted.
  return false;
}

/** A new hash, at the cost PHP's PASSWORD_DEFAULT uses (10). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/**
 * True when a stored hash should be upgraded on the next successful sign-in,
 * mirroring password_needs_rehash() in the original login pages.
 */
export function needsRehash(stored: string): boolean {
  const hash = (stored ?? '').trim();
  if (!hash.startsWith('$2')) return true;
  const cost = Number(hash.split('$')[2]);
  return !Number.isFinite(cost) || cost < 10;
}
