'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { getLang, isLang, translate } from '@/lib/i18n';
import { normaliseBdPhone } from '@/lib/auth/phone';
import { allSettings, setting, settingLocalized } from '@/lib/settings';
import { saveSettings } from '@/lib/settings/save';
import { sendMail } from '@/lib/email/send';
import { emailLayout, emailParagraph } from '@/lib/email/layout';
import { absoluteUrl } from '@/lib/site/url';
import { deleteFile, putFile } from '@/lib/storage/store';
import { IMAGE_EXTENSIONS, uniqueFilename, validateUpload } from '@/lib/storage/validate';
import {
  EMAIL_KEYS,
  IMAGE_KEYS,
  NUMBER_KEYS,
  PHONE_KEYS,
  SWITCH_KEYS,
  TEXT_KEYS,
  URL_KEYS,
} from '@/lib/settings/schema';

/**
 * Saving the website settings, from admin/settings.php.
 *
 * Two orderings matter and are kept:
 *
 *   1. **Images are stored only after every text field is valid**, so a form
 *      that fails validation leaves no orphan file on disk.
 *   2. **The old image is deleted only after the settings are saved.** The other
 *      way round loses the logo that is still on the live site.
 *
 * The SMTP password is write-only: an empty box leaves the stored one alone, and
 * only the explicit "clear" box empties it. It is never written back to the page.
 */

export interface SettingsState {
  errors: string[];
  message: string;
}

function refresh(): void {
  revalidatePath('/admin/settings');
  // Institute name, logo, helpline and the director section are on every public
  // page.
  revalidatePath('/', 'layout');
}

export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  await requireAdmin();
  const lang = await getLang();
  const errors: string[] = [];
  const values: Record<string, string> = {};

  const raw = (key: string) => String(formData.get(key) ?? '').trim();

  for (const [key, max] of Object.entries(TEXT_KEYS)) {
    values[key] = raw(key).slice(0, max);
  }

  for (const [key, label] of Object.entries(EMAIL_KEYS)) {
    const value = raw(key);
    values[key] = value;
    if (value !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      errors.push(translate(lang, 'set.err_email', { field: translate(lang, label) }));
    }
  }

  for (const [key, label] of Object.entries(PHONE_KEYS)) {
    const value = raw(key);
    if (value === '') {
      values[key] = '';
      continue;
    }
    const normalised = normaliseBdPhone(value);
    if (normalised === null) {
      errors.push(translate(lang, 'set.err_phone', { field: translate(lang, label) }));
      // Keep what was typed so the form can show it back.
      values[key] = value;
    } else {
      values[key] = normalised;
    }
  }

  for (const [key, label] of Object.entries(URL_KEYS)) {
    const value = raw(key).slice(0, 500);
    values[key] = value;
    if (value !== '' && !/^https?:\/\/\S+\.\S+/i.test(value)) {
      errors.push(translate(lang, 'set.err_url', { field: translate(lang, label) }));
    }
  }

  for (const key of SWITCH_KEYS) {
    values[key] = formData.get(key) !== null ? '1' : '0';
  }

  for (const [key, [fallback, min, max]] of Object.entries(NUMBER_KEYS)) {
    const number = Number(formData.get(key) ?? fallback);
    values[key] = String(
      !Number.isFinite(number) || number < min || number > max ? fallback : Math.floor(number)
    );
  }

  const prefix = raw('student_id_prefix').toUpperCase().replace(/[^A-Z]/g, '');
  if (prefix === '') errors.push(translate(lang, 'set.err_prefix'));
  values.student_id_prefix = prefix.slice(0, 10);

  const chosenLang = String(formData.get('default_language') ?? '');
  values.default_language = isLang(chosenLang) ? chosenLang : 'bn';

  const port = Number(formData.get('smtp_port') ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(translate(lang, 'set.err_port'));
  }
  values.smtp_port = String(port);

  const encryption = String(formData.get('smtp_encryption') ?? '');
  values.smtp_encryption = ['tls', 'ssl', 'none'].includes(encryption) ? encryption : 'tls';

  const password = String(formData.get('smtp_password') ?? '');
  if (password !== '') values.smtp_password = password;
  else if (formData.get('smtp_password_clear') !== null) values.smtp_password = '';

  const months = Number(formData.get('id_card_validity_months') ?? 12);
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    errors.push(translate(lang, 'set.err_validity'));
  }
  values.id_card_validity_months = String(months);

  // Images last, and only when everything else is valid.
  const written: { key: string; next: string; previous: string }[] = [];

  if (errors.length === 0) {
    for (const [key, [field, folder, namePrefix, maxMb, label]] of Object.entries(IMAGE_KEYS)) {
      const current = await setting(key, '');
      const upload = formData.get(field);

      if (upload instanceof File && upload.size > 0) {
        const check = await validateUpload(upload, [...IMAGE_EXTENSIONS], maxMb * 1048576);
        if (!check.ok) {
          errors.push(
            translate(lang, 'set.err_upload', {
              field: translate(lang, label),
              error: check.error,
            })
          );
          continue;
        }

        const stored = await putFile(
          `uploads/${folder}`,
          uniqueFilename(check.ext, namePrefix),
          check.bytes ?? Buffer.alloc(0),
          check.mime
        );
        if (stored === null) {
          errors.push(
            translate(lang, 'set.err_upload', {
              field: translate(lang, label),
              error: translate(lang, 'upload.save_failed'),
            })
          );
          continue;
        }

        values[key] = stored;
        written.push({ key, next: stored, previous: current });
      } else if (formData.get(`remove_${field}`) !== null && current !== '') {
        values[key] = '';
        written.push({ key, next: '', previous: current });
      }
    }
  }

  if (errors.length === 0 && (await saveSettings(values))) {
    for (const file of written) {
      if (file.previous !== '' && file.previous !== file.next) await deleteFile(file.previous);
    }
    refresh();
    return { errors: [], message: translate(lang, 'set.saved') };
  }

  // Nothing was saved: anything just written to disk is rubbish.
  for (const file of written) {
    if (file.next !== '') await deleteFile(file.next);
  }

  return {
    errors: errors.length > 0 ? errors : [translate(lang, 'set.save_failed')],
    message: '',
  };
}

/**
 * The test email.
 *
 * It goes through the same adapter as every other message, so a success here
 * means real delivery is working — and a failure shows the provider's own reason.
 */
export async function testEmailAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  await requireAdmin();
  const lang = await getLang();

  const to = String(formData.get('test_to') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    return {
      errors: [translate(lang, 'set.err_email', { field: translate(lang, 'set.test_to') })],
      message: '',
    };
  }

  const institute = await settingLocalized('institute_name', 'Orbit Private Care', lang);
  const subject = translate(lang, 'set.test_subject', { institute });
  const body = translate(lang, 'set.test_body');

  const result = await sendMail({
    to,
    subject,
    text: body,
    html: await emailLayout(
      lang,
      subject,
      emailParagraph(body),
      absoluteUrl('/admin/settings'),
      translate(lang, 'set.title')
    ),
    template: 'test',
  });

  if (!result.ok) {
    return {
      errors: [translate(lang, 'set.test_failed', { error: translate(lang, result.error) })],
      message: '',
    };
  }

  return { errors: [], message: translate(lang, 'set.test_sent', { email: to }) };
}

/** Every setting as it stands, for the form. */
export async function currentSettings(): Promise<Record<string, string>> {
  await requireAdmin();
  return allSettings();
}
