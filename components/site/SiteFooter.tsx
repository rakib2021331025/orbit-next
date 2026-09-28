import Link from 'next/link';
import { getTranslator } from '@/lib/i18n';
import { allSettings, instituteName, settingLocalized } from '@/lib/settings';
import { publicCourses } from '@/lib/site/courses';
import { safeUrl, formatPhone, telHref, whatsappUrl, mapSearchUrl } from '@/lib/site/url';

/**
 * The public footer, from includes/site_footer.php.
 *
 * Every contact detail comes from Admin → Settings, and each block renders only
 * when its setting is filled — an empty address line or a WhatsApp link to
 * nowhere is worse than the absence of one.
 */
export async function SiteFooter() {
  const [{ t, digits, pick }, settings, siteName, about, address, courses] = await Promise.all([
    getTranslator(),
    allSettings(),
    instituteName(),
    settingLocalized('about_text', ''),
    settingLocalized('institute_address', ''),
    publicCourses(),
  ]);

  const phone = (settings.contact_phone ?? '').trim();
  const helpline = (settings.helpline_number ?? '').trim();
  const email = (settings.institute_email ?? '').trim();
  const whatsapp = whatsappUrl(settings.whatsapp_number ?? '');
  const facebook = safeUrl(settings.facebook_url ?? '');
  const youtube = safeUrl(settings.youtube_url ?? '');
  // An explicit map URL wins; otherwise the address becomes a Maps search.
  const map = safeUrl(settings.map_url ?? '') || mapSearchUrl(address);

  const quickLinks = [
    { href: '/', label: t('nav.home') },
    { href: '/courses', label: t('nav.courses') },
    { href: '/online-classes', label: t('nav.online_classes') },
    { href: '/notices', label: t('nav.notices') },
    { href: '/gallery', label: t('nav.gallery') },
    { href: '/results', label: t('nav.results') },
    { href: '/check-status', label: t('nav.check_status') },
    { href: '/inquiry', label: t('inquiry.page_title') },
  ];

  return (
    <footer className="mt-16 bg-brand-deep text-white/80">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="grid h-11 w-11 place-items-center rounded-orbit bg-white/10 font-head text-xl font-semibold text-white">
                O
              </span>
              <span className="font-head font-semibold text-white">{siteName}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed">
              {about !== '' ? about : t('footer.about_default', { brand: 'Orbit Private Care' })}
            </p>

            {(facebook || youtube || whatsapp) && (
              <div className="mt-5 flex gap-2" aria-label={t('footer.follow_us')}>
                {facebook && <Social href={facebook} icon="bi-facebook" label="Facebook" />}
                {youtube && <Social href={youtube} icon="bi-youtube" label="YouTube" />}
                {whatsapp && <Social href={whatsapp} icon="bi-whatsapp" label="WhatsApp" />}
              </div>
            )}
          </div>

          <div>
            <h2 className="font-head text-sm font-semibold uppercase tracking-wide text-white">
              {t('footer.quick_links')}
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-head text-sm font-semibold uppercase tracking-wide text-white">
              {t('footer.our_courses')}
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {courses.slice(0, 5).map((course) => (
                <li key={course.id}>
                  <Link href={`/courses/${course.id}`} className="transition hover:text-white">
                    {pick(course, 'name')}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/apply" className="font-semibold text-white transition hover:underline">
                  {t('nav.enroll_now')} &rarr;
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-head text-sm font-semibold uppercase tracking-wide text-white">
              {t('footer.contact_us')}
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              {phone !== '' && (
                <li className="flex gap-2.5">
                  <i className="bi bi-telephone-fill mt-0.5 shrink-0" aria-hidden />
                  <a href={telHref(phone)} className="transition hover:text-white">
                    {formatPhone(phone)}
                  </a>
                </li>
              )}
              {helpline !== '' && helpline !== phone && (
                <li className="flex gap-2.5">
                  <i className="bi bi-headset mt-0.5 shrink-0" aria-hidden />
                  <span>
                    {t('common.helpline')}:{' '}
                    <a href={telHref(helpline)} className="transition hover:text-white">
                      {formatPhone(helpline)}
                    </a>
                  </span>
                </li>
              )}
              {email !== '' && (
                <li className="flex gap-2.5">
                  <i className="bi bi-envelope-fill mt-0.5 shrink-0" aria-hidden />
                  <a href={`mailto:${email}`} className="break-all transition hover:text-white">
                    {email}
                  </a>
                </li>
              )}
              {address !== '' && (
                <li className="flex gap-2.5">
                  <i className="bi bi-geo-alt-fill mt-0.5 shrink-0" aria-hidden />
                  <span>
                    {address}
                    {map !== '' && (
                      <>
                        <br />
                        <a
                          href={map}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline transition hover:text-white"
                        >
                          {t('footer.open_map')}
                        </a>
                      </>
                    )}
                  </span>
                </li>
              )}
              {whatsapp !== '' && (
                <li className="flex gap-2.5">
                  <i className="bi bi-whatsapp mt-0.5 shrink-0" aria-hidden />
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition hover:text-white"
                  >
                    {t('footer.chat_whatsapp')}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs">
          <span>
            &copy; {digits(new Date().getFullYear())} {siteName}. {t('footer.rights')}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {t('footer.portals')}:
            <Link href="/student/login" className="transition hover:text-white">
              {t('common.student')}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/guardian/login" className="transition hover:text-white">
              {t('footer.portal_guardian')}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/teacher/login" className="transition hover:text-white">
              {t('common.teacher')}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/admin/login" className="transition hover:text-white">
              Admin
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

function Social({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      // noopener on every new-tab link: without it the opened page can reach
      // back through window.opener.
      rel="noopener noreferrer"
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
    >
      <i className={`bi ${icon}`} aria-hidden />
    </a>
  );
}
