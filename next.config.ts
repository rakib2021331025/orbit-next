import type { NextConfig } from 'next';

/** The Supabase Storage host, so next/image may optimise public-bucket images. */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    return '';
  }
})();

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // NEXT_BUILD_CPUS=1 limits the build's page-generation workers, for machines
  // with little free memory (a worker crash there looks like exit 3221226505).
  // Unset, Next.js picks the number itself, as on Vercel.
  ...(process.env.NEXT_BUILD_CPUS ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } } : {}),

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },

  async headers() {
    return [
      // The portals show private data; nothing here may be cached by a shared
      // proxy. Public marketing pages set their own caching per route.
      {
        source: '/(student|teacher|guardian|admin)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Brand images under public/assets change only with a deploy, and a
      // redesign ships new filenames. A week in the browser, then revalidated.
      {
        source: '/assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
    ];
  },
};

export default config;
