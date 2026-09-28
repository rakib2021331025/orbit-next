'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { saveSettingsAction, testEmailAction } from './actions';
import type { SettingsTab } from '@/lib/settings/schema';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

const EMPTY = { errors: [] as string[], message: '' };

export interface SettingsValues {
  [key: string]: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number' | 'password';
  max?: number;
  rows?: number;
  hint?: string;
  min?: number;
  step?: number;
}

/** One field, single-language. */
function Field({
  spec,
  value,
}: {
  spec: FieldSpec;
  value: string;
}) {
  return (
    <label className="block text-xs font-medium text-ink">
      {spec.label}
      {spec.rows ? (
        <textarea
          name={spec.key}
          rows={spec.rows}
          maxLength={spec.max}
          defaultValue={value}
          className={`mt-1 ${CONTROL}`}
        />
      ) : (
        <input
          type={spec.type ?? 'text'}
          name={spec.key}
          maxLength={spec.max}
          min={spec.min}
          step={spec.step}
          defaultValue={value}
          className={`mt-1 ${CONTROL}`}
        />
      )}
      {spec.hint && (
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">{spec.hint}</span>
      )}
    </label>
  );
}

/** A bilingual pair: English and Bangla side by side, as the original renders it. */
function Pair({
  spec,
  values,
  labels,
}: {
  spec: FieldSpec;
  values: SettingsValues;
  labels: { english: string; bangla: string };
}) {
  return (
    <>
      <Field
        spec={{ ...spec, label: `${spec.label} (${labels.english})` }}
        value={values[spec.key] ?? ''}
      />
      <label className="block text-xs font-medium text-ink">
        {spec.label} ({labels.bangla})
        {spec.rows ? (
          <textarea
            name={`${spec.key}_bn`}
            rows={spec.rows}
            maxLength={spec.max}
            lang="bn"
            defaultValue={values[`${spec.key}_bn`] ?? ''}
            className={`mt-1 ${CONTROL}`}
          />
        ) : (
          <input
            type="text"
            name={`${spec.key}_bn`}
            maxLength={spec.max}
            lang="bn"
            defaultValue={values[`${spec.key}_bn`] ?? ''}
            className={`mt-1 ${CONTROL}`}
          />
        )}
      </label>
    </>
  );
}

function Switch({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className="h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
      />
      <span>{label}</span>
    </label>
  );
}

/** An image setting: what is stored now, a replacement, and a "go back to none" box. */
function ImageField({
  field,
  label,
  hint,
  removeLabel,
  currentUrl,
}: {
  field: string;
  label: string;
  hint?: string;
  removeLabel: string;
  currentUrl: string;
}) {
  return (
    <div className="space-y-2">
      {currentUrl !== '' && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt=""
            className="h-16 w-auto rounded-orbit bg-brand-deep p-1 object-contain"
          />
          <Switch name={`remove_${field}`} label={removeLabel} checked={false} />
        </>
      )}
      <label className="block text-xs font-medium text-ink">
        {label}
        <input
          type="file"
          name={field}
          accept="image/png,image/jpeg,image/webp"
          className={`mt-1 ${CONTROL}`}
        />
        {hint && <span className="mt-1 block text-[11px] font-normal text-ink-muted">{hint}</span>}
      </label>
    </div>
  );
}

/**
 * The whole settings form, one tab at a time.
 *
 * Every tab posts the **same** form, so switching tabs in the browser never
 * loses what was typed on another one — the original relies on Bootstrap's tab
 * panes for exactly that reason.
 */
export function SettingsForm({
  tab,
  values,
  urls,
  languages,
  hasPassword,
  mailOn,
  aiKeyMissing,
  labels,
}: {
  tab: SettingsTab;
  values: SettingsValues;
  urls: { logo: string; director: string; developer: string };
  languages: { code: string; label: string }[];
  hasPassword: boolean;
  mailOn: boolean;
  aiKeyMissing: boolean;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, EMPTY);
  const [test, testAction, testPending] = useActionState(testEmailAction, EMPTY);
  const [prefix, setPrefix] = useState(values.student_id_prefix ?? 'STU');

  const pairLabels = { english: labels.english, bangla: labels.bangla };
  const value = (key: string, fallback = '') =>
    (values[key] ?? '') !== '' ? values[key] : fallback;

  return (
    <div className="space-y-6">
      {state.errors.length > 0 && (
        <Alert tone="danger">
          <ul className="list-inside list-disc space-y-1">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <form action={action} className="space-y-6">
        <input type="hidden" name="tab" value={tab} />

        {tab === 'institute' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Pair
              spec={{ key: 'institute_name', label: labels.instituteName, max: 150 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'institute_tagline', label: labels.tagline, max: 150 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'institute_address', label: labels.address, max: 500, rows: 2 }}
              values={values}
              labels={pairLabels}
            />

            <Field
              spec={{ key: 'institute_email', label: labels.email, type: 'email' }}
              value={values.institute_email ?? ''}
            />
            <Field
              spec={{ key: 'contact_phone', label: labels.contactPhone, type: 'tel' }}
              value={values.contact_phone ?? ''}
            />
            <Field
              spec={{ key: 'whatsapp_number', label: labels.whatsapp, type: 'tel' }}
              value={values.whatsapp_number ?? ''}
            />
            <Field
              spec={{ key: 'facebook_url', label: labels.facebook, type: 'url', max: 500 }}
              value={values.facebook_url ?? ''}
            />
            <Field
              spec={{ key: 'youtube_url', label: labels.youtube, type: 'url', max: 500 }}
              value={values.youtube_url ?? ''}
            />
            <Field
              spec={{
                key: 'map_url',
                label: labels.map,
                type: 'url',
                max: 500,
                hint: labels.mapHint,
              }}
              value={values.map_url ?? ''}
            />
            <Field
              spec={{
                key: 'site_url',
                label: labels.siteUrl,
                type: 'url',
                max: 500,
                hint: labels.siteUrlHint,
              }}
              value={values.site_url ?? ''}
            />

            <label className="block text-xs font-medium text-ink">
              {labels.idPrefix}
              <input
                name="student_id_prefix"
                maxLength={10}
                value={prefix}
                onChange={(event) => setPrefix(event.currentTarget.value.toUpperCase())}
                className={`mt-1 ${CONTROL}`}
              />
              <span className="mt-1 block text-[11px] font-normal text-ink-muted">
                {labels.idPrefixHint.replace(
                  '{example}',
                  `${(prefix || 'STU').replace(/[^A-Za-z]/g, '').toUpperCase()}-${new Date().getFullYear()}-0001`
                )}
              </span>
            </label>

            <label className="block text-xs font-medium text-ink">
              {labels.defaultLanguage}
              <select
                name="default_language"
                defaultValue={value('default_language', 'bn')}
                className={`mt-1 ${CONTROL}`}
              >
                {languages.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="sm:col-span-2">
              <ImageField
                field="logo"
                label={labels.logo}
                hint={labels.logoHint}
                removeLabel={labels.logoRemove}
                currentUrl={urls.logo}
              />
            </div>
          </div>
        )}

        {tab === 'homepage' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Pair
              spec={{
                key: 'hero_title',
                label: labels.heroTitle,
                max: 200,
                hint: labels.heroHint,
              }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'hero_subtitle', label: labels.heroSubtitle, max: 500, rows: 2 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'about_text', label: labels.about, max: 1000, rows: 3 }}
              values={values}
              labels={pairLabels}
            />

            <Field
              spec={{
                key: 'helpline_number',
                label: labels.helplineNumber,
                type: 'tel',
                hint: labels.helplineHint,
              }}
              value={values.helpline_number ?? ''}
            />
            <div className="hidden sm:block" />
            <Pair
              spec={{ key: 'helpline_label', label: labels.helplineLabel, max: 120 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'helpline_note', label: labels.helplineNote, max: 200 }}
              values={values}
              labels={pairLabels}
            />
          </div>
        )}

        {tab === 'payment' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Alert tone="info">{labels.manualNote}</Alert>
            <div className="hidden sm:block" />

            <Field
              spec={{
                key: 'bkash_number',
                label: labels.bkash,
                type: 'tel',
                hint: labels.walletHint,
              }}
              value={values.bkash_number ?? ''}
            />
            <Field
              spec={{
                key: 'nagad_number',
                label: labels.nagad,
                type: 'tel',
                hint: labels.walletHint,
              }}
              value={values.nagad_number ?? ''}
            />
            <Pair
              spec={{
                key: 'payment_instructions',
                label: labels.paymentInstructions,
                max: 3000,
                rows: 4,
                hint: labels.paymentInstructionsHint,
              }}
              values={values}
              labels={pairLabels}
            />

            <div className="sm:col-span-2">
              <Switch
                name="allow_pay_later"
                label={labels.allowPayLater}
                checked={value('allow_pay_later', '0') === '1'}
              />
            </div>
          </div>
        )}

        {tab === 'email' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Alert tone={mailOn ? 'success' : 'warning'}>
              {mailOn ? labels.mailStatusOn : labels.mailStatusOff}
            </Alert>
            <div className="hidden sm:block" />

            <Field
              spec={{ key: 'smtp_host', label: labels.smtpHost, max: 150, hint: labels.smtpHint }}
              value={values.smtp_host ?? ''}
            />
            <Field
              spec={{
                key: 'smtp_port',
                label: labels.smtpPort,
                type: 'number',
                min: 1,
                step: 1,
              }}
              value={value('smtp_port', '587')}
            />

            <label className="block text-xs font-medium text-ink">
              {labels.smtpEncryption}
              <select
                name="smtp_encryption"
                defaultValue={value('smtp_encryption', 'tls')}
                className={`mt-1 ${CONTROL}`}
              >
                <option value="tls">TLS</option>
                <option value="ssl">SSL</option>
                <option value="none">{labels.none}</option>
              </select>
            </label>

            <Field
              spec={{ key: 'smtp_username', label: labels.smtpUsername, max: 150 }}
              value={values.smtp_username ?? ''}
            />

            <div>
              <label className="block text-xs font-medium text-ink">
                {labels.smtpPassword}
                <input
                  type="password"
                  name="smtp_password"
                  autoComplete="new-password"
                  defaultValue=""
                  className={`mt-1 ${CONTROL}`}
                />
              </label>
              {hasPassword && (
                <div className="mt-1 space-y-1">
                  <p className="text-[11px] text-ink-muted">{labels.smtpPasswordSaved}</p>
                  <Switch
                    name="smtp_password_clear"
                    label={labels.smtpPasswordClear}
                    checked={false}
                  />
                </div>
              )}
            </div>

            <Field
              spec={{ key: 'mail_from_email', label: labels.fromEmail, type: 'email' }}
              value={values.mail_from_email ?? ''}
            />
            <Field
              spec={{ key: 'mail_from_name', label: labels.fromName, max: 100 }}
              value={values.mail_from_name ?? ''}
            />
          </div>
        )}

        {tab === 'documents' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              spec={{
                key: 'id_card_validity_months',
                label: labels.idcardValidity,
                type: 'number',
                min: 1,
                step: 1,
              }}
              value={value('id_card_validity_months', '12')}
            />
            <div className="hidden sm:block" />

            <Pair
              spec={{
                key: 'id_card_note',
                label: labels.idcardNote,
                max: 600,
                rows: 4,
                hint: labels.idcardNoteHint,
              }}
              values={values}
              labels={pairLabels}
            />

            <div className="space-y-2 sm:col-span-2">
              <Switch
                name="student_id_card_download"
                label={labels.idcardStudentDownload}
                checked={value('student_id_card_download', '1') === '1'}
              />
              <Switch
                name="marksheet_show_attendance"
                label={labels.marksheetAttendance}
                checked={value('marksheet_show_attendance', '1') === '1'}
              />
            </div>
          </div>
        )}

        {tab === 'director' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Alert tone="info">{labels.directorHint}</Alert>
            <div className="hidden sm:block" />

            <Pair
              spec={{ key: 'director_name', label: labels.directorName, max: 150 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'director_designation', label: labels.directorDesignation, max: 150 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'director_experience', label: labels.directorExperience, max: 200 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'director_education', label: labels.directorEducation, max: 300 }}
              values={values}
              labels={pairLabels}
            />

            <Field
              spec={{ key: 'director_email', label: labels.directorEmail, type: 'email' }}
              value={values.director_email ?? ''}
            />
            <Field
              spec={{ key: 'director_phone', label: labels.directorPhone, type: 'tel' }}
              value={values.director_phone ?? ''}
            />

            <Pair
              spec={{ key: 'director_bio', label: labels.directorBio, max: 2000, rows: 3 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'director_message', label: labels.directorMessage, max: 3000, rows: 4 }}
              values={values}
              labels={pairLabels}
            />

            <div className="sm:col-span-2">
              <ImageField
                field="director_photo"
                label={labels.directorPhoto}
                removeLabel={labels.directorPhotoRemove}
                currentUrl={urls.director}
              />
            </div>
          </div>
        )}

        {tab === 'developer' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Alert tone="info">{labels.developerHelp}</Alert>
            <div className="hidden sm:block" />

            <div className="sm:col-span-2">
              <Switch
                name="developer_show"
                label={labels.developerShow}
                checked={value('developer_show', '1') === '1'}
              />
            </div>

            <Pair
              spec={{ key: 'developer_name', label: labels.developerName, max: 150 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'developer_affiliation', label: labels.developerAffiliation, max: 200 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'developer_department', label: labels.developerDepartment, max: 200 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{ key: 'developer_role', label: labels.developerRole, max: 100 }}
              values={values}
              labels={pairLabels}
            />
            <Pair
              spec={{
                key: 'developer_description',
                label: labels.developerDescription,
                max: 500,
                rows: 3,
              }}
              values={values}
              labels={pairLabels}
            />

            <Field
              spec={{ key: 'developer_email', label: labels.developerEmail, type: 'email' }}
              value={values.developer_email ?? ''}
            />
            <Field
              spec={{
                key: 'developer_portfolio',
                label: labels.developerPortfolio,
                type: 'url',
                max: 500,
              }}
              value={values.developer_portfolio ?? ''}
            />
            <Field
              spec={{
                key: 'developer_facebook',
                label: labels.developerFacebook,
                type: 'url',
                max: 500,
              }}
              value={values.developer_facebook ?? ''}
            />
            <Field
              spec={{
                key: 'developer_linkedin',
                label: labels.developerLinkedin,
                type: 'url',
                max: 500,
              }}
              value={values.developer_linkedin ?? ''}
            />
            <Field
              spec={{
                key: 'developer_github',
                label: labels.developerGithub,
                type: 'url',
                max: 500,
              }}
              value={values.developer_github ?? ''}
            />

            <div className="sm:col-span-2">
              <ImageField
                field="developer_photo"
                label={labels.developerPhoto}
                removeLabel={labels.developerPhotoRemove}
                currentUrl={urls.developer}
              />
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {aiKeyMissing && <Alert tone="warning">{labels.aiKeyMissing}</Alert>}
            {aiKeyMissing && <div className="hidden sm:block" />}

            <div className="sm:col-span-2">
              <Switch
                name="academic_ai_enabled"
                label={labels.aiEnabled}
                checked={value('academic_ai_enabled', '0') === '1'}
              />
            </div>

            <Field
              spec={{
                key: 'academic_ai_per_minute',
                label: labels.aiPerMinute,
                type: 'number',
                min: 1,
                step: 1,
                hint: labels.aiPerMinuteHint,
              }}
              value={value('academic_ai_per_minute', '6')}
            />
            <Field
              spec={{
                key: 'academic_ai_per_day',
                label: labels.aiPerDay,
                type: 'number',
                min: 1,
                step: 1,
                hint: labels.aiPerDayHint,
              }}
              value={value('academic_ai_per_day', '60')}
            />
            <Field
              spec={{
                key: 'academic_ai_max_chars',
                label: labels.aiMaxChars,
                type: 'number',
                min: 100,
                step: 1,
                hint: labels.aiMaxCharsHint,
              }}
              value={value('academic_ai_max_chars', '1500')}
            />
            <Field
              spec={{
                key: 'academic_ai_history',
                label: labels.aiHistory,
                type: 'number',
                min: 0,
                step: 1,
                hint: labels.aiHistoryHint,
              }}
              value={value('academic_ai_history', '8')}
            />
            <Field
              spec={{
                key: 'academic_ai_daily_pool',
                label: labels.aiPool,
                type: 'number',
                min: 0,
                step: 1,
                hint: labels.aiPoolHint,
              }}
              value={value('academic_ai_daily_pool', '60')}
            />
            <Field
              spec={{
                key: 'academic_ai_keep_days',
                label: labels.aiKeep,
                type: 'number',
                min: 0,
                step: 1,
                hint: labels.aiKeepHint,
              }}
              value={value('academic_ai_keep_days', '60')}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
      </form>

      {tab === 'email' && (
        <form
          action={testAction}
          className="space-y-3 rounded-orbit border border-line bg-surface p-4"
        >
          <h2 className="text-sm font-bold text-ink-heading">{labels.testEmail}</h2>

          {test.errors.length > 0 && <Alert tone="danger">{test.errors[0]}</Alert>}
          {test.message !== '' && <Alert tone="success">{test.message}</Alert>}

          <div className="flex flex-wrap items-end gap-3">
            <label className="block flex-1 text-xs font-medium text-ink">
              {labels.testTo}
              <input type="email" name="test_to" className={`mt-1 ${CONTROL}`} />
            </label>
            <button
              type="submit"
              disabled={testPending}
              className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60"
            >
              {labels.testSend}
            </button>
          </div>

          <p className="text-[11px] text-ink-muted">{labels.testHint}</p>
        </form>
      )}
    </div>
  );
}
