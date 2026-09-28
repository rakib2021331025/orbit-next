import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/ui/PrintButton';
import { requireAdmin, requireRecordBranch } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLang, isLang, makeTranslator, translate, LANGUAGES, type Lang } from '@/lib/i18n';
import { setting, settingLocalized } from '@/lib/settings';
import { enrollmentState } from '@/lib/enrollment/list';
import { applicantPhotoUrl } from '@/lib/storage/url';
import { formatPhone } from '@/lib/site/url';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'apf.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The A4 admission form, from admission_print.php, in Bangla or English.
 *
 *   /admission-print                 BLANK — public, for walk-in applicants to fill by hand
 *   /admission-print?id=<application> FILLED — admin only, for the student's file
 *
 * The filled form is staff-only because an application carries an address,
 * phone numbers and payment details. The applicant photo is served through the
 * authorised media route; the payment screenshot is never embedded.
 *
 * One template serves both: every field prints its value, or ruled space to
 * write on when there is none.
 */
export default async function AdmissionPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const id = /^\d+$/.test(params.id ?? '') ? Number(params.id) : 0;

  let application: Awaited<ReturnType<typeof prisma.admission.findUnique>> = null;
  if (id > 0) {
    await requireAdmin();
    try {
      await requireRecordBranch('admissions', id);
    } catch {
      notFound();
    }
    application = await prisma.admission.findUnique({ where: { id } }).catch(() => null);
    if (!application) notFound();
  }

  const docLang: Lang = isLang(params.lang) ? params.lang : await getLang();
  const ui = makeTranslator(await getLang());
  const d = makeTranslator(docLang);

  const [institute, tagline, address, phone, directorName, directorRoleRaw] = await Promise.all([
    settingLocalized('institute_name', 'Orbit Private Care', docLang),
    settingLocalized('institute_tagline', '', docLang),
    settingLocalized('institute_address', '', docLang),
    setting('helpline_number', ''),
    settingLocalized('director_name', '', docLang),
    settingLocalized('director_designation', '', docLang),
  ]);
  const directorRole =
    directorRoleRaw.trim() === '' || (docLang !== 'en' && directorRoleRaw.trim() === 'Director')
      ? d.t('ms.sign_director')
      : directorRoleRaw.trim();

  const a = application;
  const photo = a ? applicantPhotoUrl(a) : '';
  const batchLabel = a ? batchLabelDisplay(a.batch_label, a.batch_type, docLang) : '';
  const langHref = (code: Lang) => `/admission-print?${new URLSearchParams({ ...(id ? { id: String(id) } : {}), lang: code })}`;
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const box = (on: boolean) => (on ? '☑' : '☐');

  return (
    <div className="min-h-screen bg-[#eef1f6] print:bg-white" style={{ colorScheme: 'light' }}>
      <style>{PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-2">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <strong>
              <i className="bi bi-printer me-1" aria-hidden />
              {ui.t('apf.title')}
            </strong>
            <span className="ms-2 text-slate-500">
              {ui.t(a ? 'apf.mode_filled' : 'apf.mode_blank')} · A4
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex overflow-hidden rounded border border-slate-300" role="group" aria-label={ui.t('apf.doc_lang')}>
              {(Object.keys(LANGUAGES) as Lang[]).map((code) => (
                <Link
                  key={code}
                  href={langHref(code)}
                  hrefLang={code}
                  aria-current={code === docLang ? 'true' : undefined}
                  className={code === docLang ? 'bg-slate-700 px-3 py-1 text-white' : 'px-3 py-1 hover:bg-slate-100'}
                >
                  {LANGUAGES[code]}
                </Link>
              ))}
            </span>
            <Link href={a ? '/admin/applications' : '/'} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100">
              &larr; {ui.t('common.back')}
            </Link>
            {!a && (
              <Link href="/apply" className="rounded border border-blue-600 px-3 py-1 text-blue-700 hover:bg-blue-50">
                {ui.t('apf.apply_online')}
              </Link>
            )}
            <PrintButton label={ui.t('apf.print')} className="rounded bg-blue-700 px-3 py-1 font-medium text-white" />
          </div>
        </div>
      </div>

      <div className="pf-sheet" lang={docLang}>
        <header className="pf-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pf-logo" src="/assets/brand/orbit-emblem-180.png" alt="" />
          <h1 className="pf-institute">{institute}</h1>
          {tagline.trim() !== '' && <p className="pf-muted">{tagline}</p>}
          {address.trim() !== '' && (
            <p className="pf-muted">
              {address}
              {phone.trim() !== '' && ` · ${formatPhone(phone)}`}
            </p>
          )}
          <div className="pf-doctitle">{d.t('apf.title')}</div>
        </header>

        <div className="pf-top">
          <div className="pf-grid" style={{ flex: '1 1 auto' }}>
            <Row label={d.t('apf.app_no')} value={a?.application_no} />
            <Row label={d.t('common.date')} value={a ? d.date(a.created_at, 'd M Y') : ''} />
          </div>
          <div className="pf-photo-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo !== '' ? <img src={photo} alt="" /> : d.t('apf.photo_hint')}
          </div>
        </div>

        <Section title={d.t('apf.s1')} />
        <div className="pf-grid">
          <Row label={d.t('apf.name_en')} value={a?.fullname} />
          <Row label={d.t('apf.name_bn')} value={a?.fullname_bn} lang="bn" />
          <Row label={d.t('apf.dob')} value={a?.date_of_birth ? d.date(a.date_of_birth, 'd M Y') : ''} />
          <Row
            label={d.t('apf.gender')}
            value={a?.gender ? d.t(`apf.gender_${a.gender}`) : ''}
            blank={`${box(false)} ${d.t('apf.gender_male')}   ${box(false)} ${d.t('apf.gender_female')}   ${box(false)} ${d.t('apf.gender_other')}`}
          />
        </div>

        <Section title={d.t('apf.s2')} />
        <div className="pf-grid">
          <Row label={d.t('apf.father')} value={a?.father_name} />
          <Row label={d.t('apf.mother')} value={a?.mother_name} />
          <Row label={d.t('apf.guardian_mobile')} value={a?.guardian_phone} />
          <Row label={d.t('apf.relationship')} value="" />
        </div>

        <Section title={d.t('apf.s3')} />
        <div className="pf-grid">
          <Row label={d.t('apf.mobile')} value={a?.mobile} />
          <Row label={d.t('common.email')} value={a?.email} />
        </div>
        <div className="pf-grid one" style={{ marginTop: '2.5mm' }}>
          <Row label={d.t('common.address')} value={a?.address} />
          {!a && <Row label="" value="" />}
        </div>

        <Section title={d.t('apf.s4')} />
        <div className="pf-grid">
          <Row label={d.t('apf.institution')} value={a?.institution} />
          <Row label={d.t('apf.qualification')} value={a?.qualification} />
        </div>

        <Section title={d.t('apf.s5')} />
        <div className="pf-grid">
          <Row label={d.t('common.course')} value={a?.course} />
          <Row label={d.t('common.batch')} value={batchLabel} />
          <Row
            label={d.t('apf.batch_type')}
            value={a?.batch_type ? d.t(`course.type_${a.batch_type}`) : ''}
            blank={`${box(false)} ${d.t('course.type_online')}    ${box(false)} ${d.t('course.type_offline')}`}
          />
          <Row label={d.t('apf.preferred_start')} value="" />
        </div>

        <Section title={d.t('apf.s6')} />
        <div className="pf-grid">
          <Row
            label={d.t('apf.method')}
            value={a?.payment_method === 'bkash' || a?.payment_method === 'nagad' ? d.t(`apf.${a.payment_method}`) : ''}
            blank={`${box(false)} ${d.t('apf.bkash')}   ${box(false)} ${d.t('apf.nagad')}   ${box(false)} ${d.t('apf.cash')}`}
          />
          <Row
            label={d.t('common.amount')}
            value={a && a.payment_amount !== null ? d.money(Number(a.payment_amount)) : ''}
          />
          <Row label={d.t('apf.trx')} value={a?.transaction_id} />
          <Row label={d.t('apf.sender')} value={a?.sender_number} />
        </div>

        <div className="pf-declaration">
          <strong>{d.t('apf.declaration_title')}</strong> {d.t('apf.declaration', { institute })}
        </div>

        <section className="pf-signatures">
          {[
            [d.t('apf.sign_applicant'), d.t('apf.sign_date')],
            [d.t('apf.sign_guardian'), d.t('apf.sign_date')],
            [directorName.trim() !== '' ? directorName : d.t('apf.authorised'), directorRole],
          ].map(([name, role], index) => (
            <div key={index} className="pf-sign">
              <div className="pf-sign-line" />
              <div className="pf-sign-name">{name}</div>
              <div className="pf-muted">{role}</div>
            </div>
          ))}
        </section>

        <div className="pf-office">
          <div className="pf-office-title">{d.t('apf.office')}</div>
          <div className="pf-grid">
            <Row label={d.t('common.student_id')} value="" />
            <Row label={d.t('apf.verified_by')} value="" />
            <Row label={d.t('common.status')} value={a ? d.t(`status.${enrollmentState(a.status)}`) : ''} />
            <Row label={d.t('apf.admitted_on')} value="" />
          </div>
        </div>

        <p className="pf-footnote">
          {institute}
          {phone.trim() !== '' && ` · ${d.t('apf.helpline', { phone: formatPhone(phone) })}`}
          {site !== '' && ` · ${d.t('apf.online_at', { site })}`}
        </p>
      </div>
    </div>
  );
}

/** orbit_batch_label_display(): "Name (Online)" is stored in English; translate the suffix. */
function batchLabelDisplay(label: string | null, type: string | null, lang: Lang): string {
  const value = (label ?? '').trim();
  if (value === '' || (type !== 'online' && type !== 'offline')) return value;
  const suffix = type === 'online' ? ' (Online)' : ' (Offline)';
  if (value.length <= suffix.length || !value.endsWith(suffix)) return value;
  return `${value.slice(0, -suffix.length)} (${translate(lang, `course.type_${type}`)})`;
}

function Section({ title }: { title: string }) {
  return <div className="pf-section-title">{title}</div>;
}

/** A value, or ruled space to write on (or the tick-box choices) when there is none. */
function Row({
  label,
  value,
  blank,
  lang,
}: {
  label: string;
  value: string | null | undefined;
  blank?: string;
  lang?: string;
}) {
  const text = (value ?? '').trim();
  return (
    <div className="pf-row">
      <span className="pf-label">{label}</span>
      <span className="pf-field" lang={lang}>
        {text !== '' ? (
          <span className="pf-value">{text}</span>
        ) : blank ? (
          <span style={{ whiteSpace: 'pre' }}>{blank}</span>
        ) : (
          <span className="pf-blank" />
        )}
      </span>
    </div>
  );
}

/** A document, not part of the themed site: always light, always A4. */
const PRINT_CSS = `
.pf-sheet { background:#fff; color:#14213d; width:210mm; max-width:100%; min-height:297mm; margin:16px auto; padding:12mm 14mm; box-sizing:border-box; font-family:Inter,'Hind Siliguri',system-ui,sans-serif; box-shadow:0 2px 12px rgba(0,0,0,.08); }
.pf-sheet[lang="bn"] { font-family:'Hind Siliguri',Inter,system-ui,sans-serif; }
.pf-header { text-align:center; border-bottom:0.5mm solid #14213d; padding-bottom:3mm; margin-bottom:4mm; }
.pf-logo { display:block; height:15mm; width:auto; margin:0 auto 2mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.pf-institute { font-size:6mm; font-weight:800; margin:0; }
.pf-muted { font-size:2.8mm; color:#5b6480; margin:0.5mm 0 0; }
.pf-doctitle { display:inline-block; margin-top:2mm; font-size:3.6mm; font-weight:700; border:0.35mm solid #14213d; border-radius:1mm; padding:1mm 4mm; }
.pf-top { display:flex; justify-content:space-between; align-items:flex-start; gap:4mm; }
.pf-section-title { background:#14213d; color:#fff; font-size:3mm; font-weight:700; text-transform:uppercase; letter-spacing:.06em; padding:1.5mm 3mm; border-radius:1mm; margin:5mm 0 3mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.pf-sheet[lang="bn"] .pf-section-title, .pf-sheet[lang="bn"] .pf-office-title { letter-spacing:0; text-transform:none; }
.pf-grid { display:grid; grid-template-columns:1fr 1fr; gap:2.5mm 6mm; }
.pf-grid.one { grid-template-columns:1fr; }
.pf-row { display:flex; gap:2mm; font-size:3.1mm; align-items:baseline; }
.pf-label { flex:0 0 32mm; color:#5b6480; }
.pf-field { flex:1 1 auto; min-width:0; border-bottom:0.25mm dotted #98a2b8; padding-bottom:.6mm; }
.pf-value { font-weight:700; }
.pf-blank { display:inline-block; width:100%; height:4mm; }
.pf-photo-box { width:30mm; height:36mm; flex:0 0 30mm; border:0.35mm dashed #7c879e; display:flex; align-items:center; justify-content:center; text-align:center; font-size:2.4mm; color:#7c879e; overflow:hidden; padding:2mm; box-sizing:border-box; }
.pf-photo-box img { width:100%; height:100%; object-fit:cover; }
.pf-declaration { margin-top:5mm; font-size:2.7mm; line-height:1.6; color:#3d465e; border:0.25mm solid #c3cad9; border-radius:1.5mm; padding:3mm; }
.pf-signatures { display:grid; grid-template-columns:repeat(3,1fr); gap:8mm; margin-top:12mm; text-align:center; }
.pf-sign-line { border-top:0.3mm solid #14213d; margin-bottom:1mm; }
.pf-sign-name { font-size:3mm; font-weight:700; }
.pf-office { margin-top:4mm; border:0.35mm solid #14213d; border-radius:1.5mm; padding:3mm; }
.pf-office-title { font-size:2.7mm; font-weight:800; text-transform:uppercase; letter-spacing:.06em; margin-bottom:2mm; }
.pf-footnote { margin-top:4mm; text-align:center; font-size:2.5mm; color:#7c879e; }
@media print {
  @page { size:A4; margin:0; }
  .no-print { display:none !important; }
  .pf-sheet { margin:0; box-shadow:none; width:auto; }
}
`;
