import type { Metadata, Viewport } from 'next';
import { getLang } from '@/lib/i18n';
import { getTheme } from '@/lib/theme';
import './globals.css';

/**
 * Metadata mirrors what the PHP app emits from includes/seo_lib.php so the
 * migrated site keeps its search presence: the same names in both languages, the
 * same description, and noindex applied per-portal rather than here.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Orbit Private Care — Excellence in Coaching',
    template: '%s | Orbit Private Care',
  },
  description:
    'Orbit Private Care, Rangpur — অরবিট প্রাইভেট কেয়ার. Coaching for school, college and admission students: classes, exams, results and study materials in one place.',
  applicationName: 'Orbit Private Care',
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    siteName: 'Orbit Private Care',
    locale: 'bn_BD',
    alternateLocale: 'en_US',
  },
  // Google picks the search-result icon from these tags and wants a square whose
  // side is a multiple of 48 — hence the 192 next to the favicon, as the PHP
  // site's orbit_favicon_tags() offers it.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/assets/brand/orbit-emblem-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/assets/brand/orbit-emblem-64.png', type: 'image/png', sizes: '64x64' },
    ],
    apple: '/assets/brand/orbit-emblem-180.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#062c19',
};

/**
 * Applies the stored theme before first paint.
 *
 * The server already renders `data-theme` from the cookie, so this only has to
 * cover the case where localStorage and the cookie disagree — a theme changed in
 * another tab. Without it, that tab's next navigation flashes the old theme.
 * Inline and synchronous on purpose: anything deferred runs after paint, which is
 * exactly the flash being avoided.
 */
const THEME_SCRIPT =
  '(function(){try{var t=localStorage.getItem("orbit_theme");' +
  'if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);

  return (
    // lang and data-theme are the same two attributes the PHP app sets, and for
    // the same reasons: Bangla text needs the right lang for hyphenation and
    // screen readers, and every colour token hangs off data-theme.
    <html lang={lang} data-theme={theme} suppressHydrationWarning>
      <head>
        {/* Bootstrap Icons, as the original loads them — every `bi-*` name in the
            ported navigation refers to this set. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600;700&family=Hind+Siliguri:wght@400;500;600;700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-page font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
