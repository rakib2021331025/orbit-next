import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody } from '@/components/ui/Card';
import { getLang, translate, LANGUAGES } from '@/lib/i18n';
import { allSettings } from '@/lib/settings';
import { mailIsConfigured } from '@/lib/email/send';
import { uploadUrl } from '@/lib/storage/url';
import { SETTINGS_TABS, type SettingsTab } from '@/lib/settings/schema';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'set.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Website settings, from admin/settings.php.
 *
 * One tab at a time, and the tab is in the URL so a save comes back to where the
 * admin was working. Everything the public site, the emails, the marksheets and
 * the ID cards say about the institute lives here — nothing is hard-coded.
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="settings" route="/admin/settings" title="">
      {async ({ t }) => {
        const tab: SettingsTab = SETTINGS_TABS.includes(params.tab as SettingsTab)
          ? (params.tab as SettingsTab)
          : 'institute';

        const settings = await allSettings();
        // The stored password is never sent to the page; only whether there is one.
        const hasPassword = (settings.smtp_password ?? '') !== '';
        const values = { ...settings };
        delete values.smtp_password;

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('set.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('set.sub')}</p>
              </div>
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
              >
                <i className="bi bi-box-arrow-up-right me-1" aria-hidden /> {t.t('set.view_site')}
              </a>
            </div>

            <div className="flex flex-wrap gap-2">
              {SETTINGS_TABS.map((key) => (
                <Link
                  key={key}
                  href={`/admin/settings?tab=${key}`}
                  aria-current={tab === key ? 'page' : undefined}
                  className={`rounded-orbit px-3 py-1.5 text-sm font-medium transition ${
                    tab === key
                      ? 'bg-primary text-white'
                      : 'border border-line text-ink hover:bg-surface-2'
                  }`}
                >
                  {t.t(`set.tab.${key}`)}
                </Link>
              ))}
            </div>

            <Card>
              <CardBody>
                <SettingsForm
                  tab={tab}
                  values={values}
                  urls={{
                    logo: (settings.logo_path ?? '') !== '' ? uploadUrl(settings.logo_path) : '',
                    director:
                      (settings.director_photo ?? '') !== ''
                        ? uploadUrl(settings.director_photo)
                        : '',
                    developer:
                      (settings.developer_photo ?? '') !== ''
                        ? uploadUrl(settings.developer_photo)
                        : '',
                  }}
                  languages={Object.entries(LANGUAGES).map(([code, label]) => ({ code, label }))}
                  hasPassword={hasPassword}
                  mailOn={mailIsConfigured()}
                  // The assistant needs a server-side key; without it the switch
                  // cannot turn anything on, and saying so beats silence.
                  aiKeyMissing={(process.env.ORBIT_GEMINI_API_KEY ?? '') === ''}
                  labels={{
                    english: t.t('set.english'),
                    bangla: t.t('set.bangla'),
                    instituteName: t.t('set.institute_name'),
                    tagline: t.t('set.tagline'),
                    address: t.t('set.address'),
                    email: t.t('set.email'),
                    contactPhone: t.t('set.contact_phone'),
                    whatsapp: t.t('set.whatsapp'),
                    facebook: t.t('set.facebook'),
                    youtube: t.t('set.youtube'),
                    map: t.t('set.map'),
                    mapHint: t.t('set.map_hint'),
                    siteUrl: t.t('set.site_url'),
                    siteUrlHint: t.t('set.site_url_hint'),
                    idPrefix: t.t('set.id_prefix'),
                    idPrefixHint: t.t('set.id_prefix_hint', { example: '{example}' }),
                    defaultLanguage: t.t('set.default_language'),
                    logo: t.t('set.logo'),
                    logoHint: t.t('set.logo_hint'),
                    logoRemove: t.t('set.logo_remove'),
                    heroTitle: t.t('set.hero_title'),
                    heroSubtitle: t.t('set.hero_subtitle'),
                    heroHint: t.t('set.hero_hint'),
                    about: t.t('set.about'),
                    helplineNumber: t.t('set.helpline_number'),
                    helplineHint: t.t('set.helpline_hint'),
                    helplineLabel: t.t('set.helpline_label'),
                    helplineNote: t.t('set.helpline_note'),
                    manualNote: t.t('set.manual_note'),
                    bkash: t.t('set.bkash'),
                    nagad: t.t('set.nagad'),
                    walletHint: t.t('set.wallet_hint'),
                    paymentInstructions: t.t('set.payment_instructions'),
                    paymentInstructionsHint: t.t('set.payment_instructions_hint'),
                    allowPayLater: t.t('set.allow_pay_later'),
                    mailStatusOn: t.t('set.mail_status_on'),
                    mailStatusOff: t.t('set.mail_status_off'),
                    smtpHost: t.t('set.smtp_host'),
                    smtpHint: t.t('set.smtp_hint'),
                    smtpPort: t.t('set.smtp_port'),
                    smtpEncryption: t.t('set.smtp_encryption'),
                    smtpUsername: t.t('set.smtp_username'),
                    smtpPassword: t.t('set.smtp_password'),
                    smtpPasswordSaved: t.t('set.smtp_password_saved'),
                    smtpPasswordClear: t.t('set.smtp_password_clear'),
                    fromEmail: t.t('set.from_email'),
                    fromName: t.t('set.from_name'),
                    none: t.t('set.none'),
                    testEmail: t.t('set.test_email'),
                    testTo: t.t('set.test_to'),
                    testSend: t.t('set.test_send'),
                    testHint: t.t('set.test_hint'),
                    idcardValidity: t.t('set.idcard_validity'),
                    idcardNote: t.t('set.idcard_note'),
                    idcardNoteHint: t.t('set.idcard_note_hint'),
                    idcardStudentDownload: t.t('set.idcard_student_download'),
                    marksheetAttendance: t.t('set.marksheet_attendance'),
                    directorHint: t.t('set.director_hint'),
                    directorName: t.t('set.director_name'),
                    directorDesignation: t.t('set.director_designation'),
                    directorExperience: t.t('set.director_experience'),
                    directorEducation: t.t('set.director_education'),
                    directorEmail: t.t('set.director_email'),
                    directorPhone: t.t('set.director_phone'),
                    directorBio: t.t('set.director_bio'),
                    directorMessage: t.t('set.director_message'),
                    directorPhoto: t.t('set.director_photo'),
                    directorPhotoRemove: t.t('set.director_photo_remove'),
                    developerHelp: t.t('set.developer_help'),
                    developerShow: t.t('set.developer_show'),
                    developerName: t.t('set.developer_name'),
                    developerAffiliation: t.t('set.developer_affiliation'),
                    developerDepartment: t.t('set.developer_department'),
                    developerRole: t.t('set.developer_role'),
                    developerDescription: t.t('set.developer_description'),
                    developerEmail: t.t('set.developer_email'),
                    developerPortfolio: t.t('set.developer_portfolio'),
                    developerFacebook: t.t('set.developer_facebook'),
                    developerLinkedin: t.t('set.developer_linkedin'),
                    developerGithub: t.t('set.developer_github'),
                    developerPhoto: t.t('set.developer_photo'),
                    developerPhotoRemove: t.t('set.developer_photo_remove'),
                    aiKeyMissing: t.t('set.ai_key_missing'),
                    aiEnabled: t.t('set.ai_enabled'),
                    aiPerMinute: t.t('set.ai_per_minute'),
                    aiPerMinuteHint: t.t('set.ai_per_minute_hint'),
                    aiPerDay: t.t('set.ai_per_day'),
                    aiPerDayHint: t.t('set.ai_per_day_hint'),
                    aiMaxChars: t.t('set.ai_max_chars'),
                    aiMaxCharsHint: t.t('set.ai_max_chars_hint'),
                    aiHistory: t.t('set.ai_history'),
                    aiHistoryHint: t.t('set.ai_history_hint'),
                    aiPool: t.t('set.ai_pool'),
                    aiPoolHint: t.t('set.ai_pool_hint'),
                    aiKeep: t.t('set.ai_keep'),
                    aiKeepHint: t.t('set.ai_keep_hint'),
                    save: t.t('set.save'),
                    saving: t.t('common.please_wait'),
                  }}
                />
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
