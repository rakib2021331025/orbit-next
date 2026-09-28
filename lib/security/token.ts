import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring tokens — orbit_sign_token() / orbit_verify_token().
 *
 * Used for two things where a session is the wrong tool:
 *
 *   - **Form tokens**, so a spam bot cannot post an enquiry without first having
 *     been served the form (and cannot post it in under three seconds).
 *   - **Share links**, so a marksheet can be sent over WhatsApp without giving
 *     the recipient an account. There the signature and the expiry ARE the
 *     authorisation, which is why the purpose is part of the signed payload: a
 *     token minted for one thing must not open another.
 *
 * The comparison is constant-time. A plain `===` on a signature leaks, through
 * timing, how many leading bytes of a forged one were right.
 */

interface Payload {
  /** Purpose. A token signed for `inquiry_form` will not verify as `marksheet`. */
  p: string;
  /** Expiry, as a Unix timestamp. */
  x: number;
  [key: string]: unknown;
}

/**
 * The signing secret.
 *
 * The PHP app keeps it in `site_settings.app_secret`; here it is `AUTH_SECRET`,
 * which is already required to be at least 32 characters. Failing loudly beats
 * signing share links with a guessable key.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error('AUTH_SECRET is missing or shorter than 32 characters');
  }
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sign(body: string): string {
  return base64url(createHmac('sha256', secret()).update(body).digest());
}

/** A tamper-proof token for [purpose, data, expiry]. */
export function signToken(
  purpose: string,
  data: Record<string, unknown>,
  ttlSeconds: number
): string {
  const payload: Payload = {
    ...data,
    p: purpose,
    x: Math.floor(Date.now() / 1000) + Math.floor(ttlSeconds),
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * The payload, or null when the token is forged, for another purpose, or
 * expired. Never throws on malformed input — these arrive from URLs.
 */
export function verifyToken(purpose: string, token: unknown): Payload | null {
  const raw = String(token ?? '');
  const parts = raw.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  if (body === '' || signature === '') return null;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself be a leak.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as Payload;
  } catch {
    return null;
  }

  // The purpose is checked AFTER the signature, so a wrong purpose and a forged
  // signature are indistinguishable from outside.
  if (payload.p !== purpose) return null;
  if (typeof payload.x !== 'number' || payload.x < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
