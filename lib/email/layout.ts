import 'server-only';
import { allSettings, settingLocalized } from '@/lib/settings';
import { translate, type Lang } from '@/lib/i18n';
import { formatPhone } from '@/lib/site/url';

/**
 * The HTML shell every Orbit email is built in, from includes/mailer.php.
 *
 * Table-based markup with inline styles, on purpose: this has to survive Gmail,
 * Outlook and a dozen Bangladeshi webmail clients that strip `<style>` blocks and
 * ignore flexbox. Nothing here is modern CSS, and that is the point.
 *
 * The Bangla font stack is chosen per language, because an email in Bangla set in
 * a Latin font renders as a row of boxes on Windows.
 */

/** Escapes text for HTML. Every value that reaches a template goes through it. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A paragraph of escaped text, newlines becoming <br>. */
export function emailParagraph(text: string, style = ''): string {
  return `<p style="margin:0 0 12px;${style}">${esc(text).replace(/\r?\n/g, '<br>')}</p>`;
}

export type EmailRows = [label: string, value: string][];

/** The striped label/value table used by every transactional mail. */
export function emailRows(rows: EmailRows): string {
  let html =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;border:1px solid #dfe6e1;border-radius:10px;overflow:hidden">';
  let index = 0;

  for (const [label, value] of rows) {
    // An empty value is skipped rather than shown blank: a row reading
    // "Batch:" with nothing after it looks like a bug in the email.
    if (value === null || value === undefined || String(value).trim() === '') continue;

    const background = index++ % 2 ? '#ffffff' : '#f5f8f5';
    html +=
      `<tr style="background:${background}">` +
      `<td style="padding:10px 14px;color:#5b6961;font-size:14px;width:42%;border-bottom:1px solid #e8eee9">${esc(label)}</td>` +
      `<td style="padding:10px 14px;color:#062c19;font-size:14px;font-weight:700;border-bottom:1px solid #e8eee9">${esc(value)}</td>` +
      '</tr>';
  }
  return `${html}</table>`;
}

/** The same rows as plain text, for the text part of the message. */
export function emailRowsText(rows: EmailRows): string {
  return rows
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

export async function emailLayout(
  lang: Lang,
  title: string,
  bodyHtml: string,
  ctaUrl = '',
  ctaLabel = ''
): Promise<string> {
  const settings = await allSettings();
  const name = await settingLocalized('institute_name', 'Orbit Private Care', lang);
  const tagline = await settingLocalized('institute_tagline', '', lang);
  const address = await settingLocalized('institute_address', '', lang);
  const phone = settings.contact_phone || settings.helpline_number || '';
  const email = settings.institute_email ?? '';

  const font =
    lang === 'bn'
      ? "'Hind Siliguri','Noto Sans Bengali','Nirmala UI',Arial,sans-serif"
      : "'Segoe UI',Roboto,Arial,sans-serif";

  const cta =
    ctaUrl !== '' && ctaLabel !== ''
      ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="border-radius:10px;background:#fedc02">' +
        `<a href="${esc(ctaUrl)}" style="display:inline-block;padding:13px 26px;color:#062c19;font-weight:700;font-size:15px;text-decoration:none;font-family:${font}">` +
        `${esc(ctaLabel)}</a></td></tr></table>` +
        // The bare URL is printed under the button: a client that strips the
        // link still leaves the recipient something they can copy.
        `<p style="font-size:12px;color:#7a877f;word-break:break-all;margin:0 0 8px">${esc(ctaUrl)}</p>`
      : '';

  const contact: string[] = [];
  if (phone !== '') contact.push(esc(formatPhone(phone)));
  if (email !== '') {
    contact.push(
      `<a href="mailto:${esc(email)}" style="color:#fedc02;text-decoration:none">${esc(email)}</a>`
    );
  }

  return (
    `<!DOCTYPE html><html lang="${esc(lang)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title></head>` +
    `<body style="margin:0;padding:0;background:#eef3ee;font-family:${font}">` +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ee;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(6,44,25,.08)">' +
    '<tr><td style="background:#062c19;padding:22px 24px" align="left">' +
    `<div style="color:#ffffff;font-size:18px;font-weight:700;line-height:1.3">${esc(name)}</div>` +
    (tagline !== ''
      ? `<div style="color:#fedc02;font-size:13px;margin-top:2px">${esc(tagline)}</div>`
      : '') +
    '</td></tr>' +
    '<tr><td style="height:4px;background:#fedc02;line-height:4px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 26px 8px;color:#1d2a22;font-size:15px;line-height:1.7">' +
    `<h1 style="margin:0 0 14px;font-size:21px;line-height:1.35;color:#062c19">${esc(title)}</h1>` +
    bodyHtml +
    cta +
    '</td></tr>' +
    '<tr><td style="padding:6px 26px 26px;color:#46524b;font-size:14px">' +
    `${esc(translate(lang, 'email.regards'))}<br><strong style="color:#062c19">${esc(
      translate(lang, 'email.team', { name })
    )}</strong>` +
    '</td></tr>' +
    '<tr><td style="background:#041d10;padding:18px 24px;color:rgba(255,255,255,.78);font-size:12px;line-height:1.7" align="center">' +
    `<strong style="color:#ffffff">${esc(name)}</strong><br>` +
    (address !== '' ? `${esc(address)}<br>` : '') +
    (contact.length > 0 ? `${contact.join(' &middot; ')}<br>` : '') +
    `<span style="color:rgba(255,255,255,.55)">${esc(
      translate(lang, 'email.footer_auto', { name })
    )}</span>` +
    '</td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}
