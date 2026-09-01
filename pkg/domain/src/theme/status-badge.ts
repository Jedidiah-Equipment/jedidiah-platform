/**
 * A badge's text colour in the half each scheme paints.
 *
 * Web never needs this: `.dark` on `<html>` lets the cascade pick from the two-tone class. React
 * Native has no cascade, and NativeWind's own appearance store follows the platform rather than an
 * in-app theme preference, so native resolves the scheme itself and asks for one half by name.
 *
 * That half has to be a class Tailwind actually generated, which is why both are written out here
 * instead of being sliced off the two-tone string at runtime: Tailwind emits a rule per candidate it
 * scans, so `dark:text-blue-200` yields only the `.dark`-scoped rule and a bare `text-blue-200`
 * assembled in JS matches nothing and paints nothing (#1373). `status-badge.test.ts` fails if a
 * palette's halves and its two-tone class ever disagree.
 */
export type SchemeTextClassNames = { dark: string; light: string };

/** The chip tint and text colour every badge surface needs, in both the web and native forms. */
export type BadgeColorClassNames = {
  chip: string;
  text: string;
  textByScheme: SchemeTextClassNames;
};

/** Shared semantic badge palette used across web and mobile surfaces. */
export const statusBadgeColorClassNames = {
  blue: {
    chip: 'border-blue-500/50 bg-blue-500/15',
    dot: 'bg-blue-500',
    fill: 'fill-blue-500',
    text: 'text-blue-800 dark:text-blue-200',
    textByScheme: { dark: 'text-blue-200', light: 'text-blue-800' },
  },
  gray: {
    chip: 'border-gray-400/50 bg-gray-500/10',
    dot: 'bg-gray-500',
    fill: 'fill-gray-500',
    text: 'text-gray-700 dark:text-gray-200',
    textByScheme: { dark: 'text-gray-200', light: 'text-gray-700' },
  },
  green: {
    chip: 'border-emerald-500/50 bg-emerald-500/15',
    dot: 'bg-emerald-500',
    fill: 'fill-emerald-500',
    text: 'text-emerald-800 dark:text-emerald-200',
    textByScheme: { dark: 'text-emerald-200', light: 'text-emerald-800' },
  },
  orange: {
    chip: 'border-orange-500/50 bg-orange-500/15',
    dot: 'bg-orange-500',
    fill: 'fill-orange-500',
    text: 'text-orange-800 dark:text-orange-200',
    textByScheme: { dark: 'text-orange-200', light: 'text-orange-800' },
  },
  purple: {
    chip: 'border-purple-500/50 bg-purple-500/15',
    dot: 'bg-purple-500',
    fill: 'fill-purple-500',
    text: 'text-purple-800 dark:text-purple-200',
    textByScheme: { dark: 'text-purple-200', light: 'text-purple-800' },
  },
  red: {
    chip: 'border-red-500/50 bg-red-500/15',
    dot: 'bg-red-500',
    fill: 'fill-red-500',
    text: 'text-red-800 dark:text-red-200',
    textByScheme: { dark: 'text-red-200', light: 'text-red-800' },
  },
  teal: {
    chip: 'border-teal-500/50 bg-teal-500/15',
    dot: 'bg-teal-500',
    fill: 'fill-teal-500',
    text: 'text-teal-800 dark:text-teal-200',
    textByScheme: { dark: 'text-teal-200', light: 'text-teal-800' },
  },
  yellow: {
    chip: 'border-yellow-500/50 bg-yellow-500/15',
    dot: 'bg-yellow-500',
    fill: 'fill-yellow-500',
    text: 'text-yellow-800 dark:text-yellow-200',
    textByScheme: { dark: 'text-yellow-200', light: 'text-yellow-800' },
  },
} as const satisfies Record<string, BadgeColorClassNames & { dot: string; fill: string }>;

export type StatusBadgeColor = keyof typeof statusBadgeColorClassNames;

/**
 * Cancelled reads the same wherever it appears: a cancelled Quote and a cancelled Job are one fact
 * about different rows, so both chips point here rather than picking a colour each.
 */
export const cancelledBadgeColorClassNames = statusBadgeColorClassNames.orange;
