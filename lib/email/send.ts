import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * Sending email, from includes/mailer.php.
 *
 * The PHP app talks SMTP through PHPMailer. That does not work on a serverless
 * platform, whose functions cannot hold an outbound SMTP connection open and are
 * blocked on port 25 anyway — so this is an adapter with two backends:
 *
 *   `log`    (default) writes to `email_logs` and the console, sends nothing.
 *   `resend` an HTTP API, which works from a function.
 *
 * **Requires configuration before email works**: set `ORBIT_MAIL_DRIVER=resend`
 * with `ORBIT_MAIL_API_KEY` and `ORBIT_MAIL_FROM`. Until then every send is
 * recorded as `failed` with the reason, exactly as the original does when SMTP is
 * unconfigured — so an admin can see on the Email Log page that nothing is going
 * out, rather than wondering why nobody replies.
 *
 * Every send is logged either way. A failure NEVER propagates: an application
 * that was saved must not be reported as failed because a confirmation email
 * bounced.
 */

export type MailDriver = 'log' | 'resend';

export interface MailAttachment {
  /** The name the recipient sees, with its extension. */
  filename: string;
  content: Buffer;
}

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  /** Plain text. The HTML body is built from it when `html` is not given. */
  text: string;
  html?: string;
  template?: string;
  relatedType?: string;
  relatedId?: number;
  studentId?: number;
  sentBy?: number;
  /**
   * Files to attach. Kept small on purpose: a provider rejects a large message
   * outright, and the note PDFs this is used for are capped at 10 MB upstream.
   */
  attachments?: MailAttachment[];
}

export interface MailResult {
  ok: boolean;
  error: string;
}

export function mailDriver(): MailDriver {
  return process.env.ORBIT_MAIL_DRIVER === 'resend' ? 'resend' : 'log';
}

export function mailIsConfigured(): boolean {
  if (mailDriver() !== 'resend') return false;
  return Boolean(process.env.ORBIT_MAIL_API_KEY && process.env.ORBIT_MAIL_FROM);
}

/**
 * A deliverable address.
 *
 * `example.com` and friends are refused: the original checks this too, because
 * seeded demo data is full of them and a bounce costs sender reputation.
 */
export function isDeliverable(email: unknown): boolean {
  const address = String(email ?? '').trim().toLowerCase();
  if (address === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) return false;

  const domain = address.split('@')[1] ?? '';
  const placeholders = ['example.com', 'example.org', 'example.net', 'test.com', 'localhost'];
  return !placeholders.includes(domain);
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const to = message.to.trim();

  const log = async (ok: boolean, error = '') => {
    try {
      await prisma.emailLog.create({
        data: {
          recipient: to.slice(0, 255),
          subject: message.subject.slice(0, 255),
          template: message.template ?? null,
          status: ok ? 'sent' : 'failed',
          error_message: error !== '' ? error.slice(0, 1000) : null,
          related_type: message.relatedType ?? null,
          related_id: message.relatedId ?? null,
          student_id: message.studentId ?? null,
          sent_by: message.sentBy ?? null,
        },
      });
    } catch {
      // Logging a send must not break the request that triggered it.
    }
  };

  if (!isDeliverable(to)) {
    await log(false, 'No valid email address.');
    return { ok: false, error: 'mail.no_address' };
  }

  if (!mailIsConfigured()) {
    await log(false, 'Mail driver is not configured.');
    // Visible on the Email Log page: nothing is going out, and why.
    return { ok: false, error: 'mail.not_configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ORBIT_MAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.ORBIT_MAIL_FROM,
        to: message.toName ? [`${message.toName} <${to}>`] : [to],
        subject: message.subject,
        text: message.text,
        html: message.html ?? textToHtml(message.text),
        // Resend takes attachment bytes as base64.
        ...(message.attachments && message.attachments.length > 0
          ? {
              attachments: message.attachments.map((file) => ({
                filename: file.filename,
                content: file.content.toString('base64'),
              })),
            }
          : {}),
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      await log(false, `${response.status}: ${detail.slice(0, 400)}`);
      return { ok: false, error: 'mail.send_failed' };
    }

    await log(true);
    return { ok: true, error: '' };
  } catch (error) {
    await log(false, error instanceof Error ? error.message : 'unknown error');
    return { ok: false, error: 'mail.send_failed' };
  }
}

/**
 * A readable HTML body from plain text.
 *
 * Escaped first, so a name or a message in the text can never inject markup into
 * the email — the same rule as rendering to a page.
 */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px">${block.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,'Hind Siliguri',sans-serif;font-size:15px;line-height:1.6;color:#1d2a22">${paragraphs}</body></html>`;
}
