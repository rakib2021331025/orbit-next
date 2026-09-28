/**
 * What the settings page can change, from the key lists at the top of
 * admin/settings.php.
 *
 * Kept as data rather than as a form: the same lists drive validation on save
 * and the fields on screen, so a key can never be rendered but not saved (or
 * the other way round, which is how a setting silently stops working).
 *
 * A bilingual key also has a `_bn` twin with the same limit.
 */

export type SettingsTab =
  | 'institute'
  | 'homepage'
  | 'payment'
  | 'email'
  | 'documents'
  | 'director'
  | 'developer'
  | 'ai';

export const SETTINGS_TABS: SettingsTab[] = [
  'institute',
  'homepage',
  'payment',
  'email',
  'documents',
  'director',
  'developer',
  'ai',
];

/** Text settings: key → maximum length. */
export const TEXT_KEYS: Record<string, number> = {
  institute_name: 150,
  institute_name_bn: 150,
  institute_tagline: 150,
  institute_tagline_bn: 150,
  institute_address: 500,
  institute_address_bn: 500,
  hero_title: 200,
  hero_title_bn: 200,
  hero_subtitle: 500,
  hero_subtitle_bn: 500,
  about_text: 1000,
  about_text_bn: 1000,
  helpline_label: 120,
  helpline_label_bn: 120,
  helpline_note: 200,
  helpline_note_bn: 200,
  payment_instructions: 3000,
  payment_instructions_bn: 3000,
  smtp_host: 150,
  smtp_username: 150,
  mail_from_name: 100,
  id_card_note: 600,
  id_card_note_bn: 600,
  director_name: 150,
  director_name_bn: 150,
  director_designation: 150,
  director_designation_bn: 150,
  director_education: 300,
  director_education_bn: 300,
  director_experience: 200,
  director_experience_bn: 200,
  director_bio: 2000,
  director_bio_bn: 2000,
  director_message: 3000,
  director_message_bn: 3000,
  developer_name: 150,
  developer_name_bn: 150,
  developer_affiliation: 200,
  developer_affiliation_bn: 200,
  developer_department: 200,
  developer_department_bn: 200,
  developer_role: 100,
  developer_role_bn: 100,
  developer_description: 500,
  developer_description_bn: 500,
};

/** Phone settings: key → the label key used in its error message. */
export const PHONE_KEYS: Record<string, string> = {
  contact_phone: 'set.contact_phone',
  whatsapp_number: 'set.whatsapp',
  helpline_number: 'set.helpline_number',
  bkash_number: 'set.bkash',
  nagad_number: 'set.nagad',
  director_phone: 'set.director_phone',
};

export const EMAIL_KEYS: Record<string, string> = {
  institute_email: 'set.email',
  mail_from_email: 'set.from_email',
  director_email: 'set.director_email',
  developer_email: 'set.developer_email',
};

export const URL_KEYS: Record<string, string> = {
  facebook_url: 'set.facebook',
  youtube_url: 'set.youtube',
  map_url: 'set.map',
  site_url: 'set.site_url',
  developer_facebook: 'set.developer_facebook',
  developer_linkedin: 'set.developer_linkedin',
  developer_github: 'set.developer_github',
  developer_portfolio: 'set.developer_portfolio',
};

export const SWITCH_KEYS = [
  'allow_pay_later',
  'student_id_card_download',
  'marksheet_show_attendance',
  'developer_show',
  'academic_ai_enabled',
] as const;

/**
 * Whole-number settings: key → [default, minimum, maximum].
 *
 * A value outside its bounds falls back to the **default** rather than being
 * refused: these are cost limits for the AI assistant, and a typo must never
 * leave one unset.
 */
export const NUMBER_KEYS: Record<string, [number, number, number]> = {
  academic_ai_per_minute: [6, 1, 60],
  academic_ai_per_day: [60, 1, 2000],
  academic_ai_max_chars: [1500, 100, 8000],
  academic_ai_history: [8, 0, 30],
  academic_ai_daily_pool: [60, 0, 100000],
  academic_ai_keep_days: [60, 0, 3650],
};

/** The three image settings: key → [form field, folder, filename prefix, MB, label key]. */
export const IMAGE_KEYS: Record<string, [string, string, string, number, string]> = {
  logo_path: ['logo', 'branding', 'logo', 2, 'set.logo'],
  director_photo: ['director_photo', 'director', 'director', 5, 'set.director_photo'],
  developer_photo: ['developer_photo', 'developer', 'developer', 5, 'set.developer_photo'],
};
