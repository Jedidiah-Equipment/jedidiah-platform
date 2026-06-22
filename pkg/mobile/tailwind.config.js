const gluestackPlugin = require('@gluestack-ui/nativewind-utils/tailwind-plugin');

/**
 * Semantic colours resolve from CSS variables supplied by
 * `src/theme/gluestack-config.ts` at runtime. RGB-channel vars carry
 * `<alpha-value>` so opacity utilities work; `border` is a full colour because
 * the dark value is translucent.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Geist (same app font as web — pkg/domain/fonts/geist-sans). Each weight is
      // its own family because RN can't synthesize real weights from one face;
      // they are loaded via `useFonts` in app/_layout.tsx.
      fontFamily: {
        sans: ['Geist'],
        'geist-semibold': ['Geist-SemiBold'],
        'geist-bold': ['Geist-Bold'],
        // Codes use the system monospace (matching web's `font-mono`). The actual
        // per-platform face is applied via the `mono` prop on the Text primitive,
        // since RN can't resolve `monospace` on iOS; this keeps the class for parity.
        mono: ['monospace'],
      },
      colors: {
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          foreground: 'rgb(var(--color-surface-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--color-muted) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        },
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        border: 'var(--color-border)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        status: {
          'in-progress': 'rgb(var(--color-status-in-progress) / <alpha-value>)',
          scheduled: 'rgb(var(--color-status-scheduled) / <alpha-value>)',
          next: 'rgb(var(--color-status-next) / <alpha-value>)',
          'next-soft': 'rgb(var(--color-status-next-soft) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [gluestackPlugin, require('tailwindcss-animate')],
};
