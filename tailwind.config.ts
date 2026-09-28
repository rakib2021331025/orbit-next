import type { Config } from 'tailwindcss';

/**
 * The palette is the original Orbit one, copied from Orbit/assets/css/orbit.css
 * so the migrated pages keep the same visual identity rather than acquiring a
 * generic Tailwind look.
 *
 * Every colour is exposed as a CSS variable as well, because dark mode in the
 * original is driven by [data-theme="dark"] swapping the variables — the same
 * mechanism is kept here so the theme toggle behaves identically.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          deep: 'var(--orbit-brand-deep)',
          deep2: 'var(--orbit-brand-deep-2)',
          mid: 'var(--orbit-brand-mid)',
          yellow: 'var(--orbit-yellow)',
        },
        surface: {
          DEFAULT: 'var(--orbit-surface)',
          2: 'var(--orbit-surface-2)',
          3: 'var(--orbit-surface-3)',
        },
        page: {
          DEFAULT: 'var(--orbit-bg)',
          alt: 'var(--orbit-bg-alt)',
        },
        ink: {
          DEFAULT: 'var(--orbit-text)',
          muted: 'var(--orbit-text-muted)',
          heading: 'var(--orbit-heading)',
        },
        line: {
          DEFAULT: 'var(--orbit-border)',
          soft: 'var(--orbit-border-soft)',
        },
        primary: {
          DEFAULT: 'var(--orbit-primary)',
          hover: 'var(--orbit-primary-hover)',
          soft: 'var(--orbit-primary-soft)',
          text: 'var(--orbit-primary-text)',
        },
        accent: {
          DEFAULT: 'var(--orbit-accent)',
          soft: 'var(--orbit-accent-soft)',
          text: 'var(--orbit-accent-text)',
        },
      },
      fontFamily: {
        // Hind Siliguri carries the Bangla; Inter/Outfit the Latin.
        sans: ['Inter', 'Hind Siliguri', 'system-ui', 'Noto Sans Bengali', 'sans-serif'],
        head: ['Outfit', 'Hind Siliguri', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { orbit: 'var(--orbit-radius)' },
      boxShadow: {
        orbit: 'var(--orbit-shadow)',
        'orbit-lg': 'var(--orbit-shadow-lg)',
      },
    },
  },
  plugins: [],
};

export default config;
