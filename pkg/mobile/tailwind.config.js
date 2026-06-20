const gluestackPlugin = require('@gluestack-ui/nativewind-utils/tailwind-plugin');

/**
 * Colours resolve from the CSS variables defined in `global.css` (`:root` light,
 * `.dark:root` dark), which NativeWind flips by color scheme. RGB-channel vars
 * carry `<alpha-value>` so opacity utilities work; `border` is a full colour
 * because the dark value is translucent.
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
