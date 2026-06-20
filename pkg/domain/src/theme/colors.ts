import { JEDIDIAH_BRAND_YELLOW, JEDIDIAH_BRAND_YELLOW_ON_LIGHT } from '../brand.js';

/**
 * Neutral + brand surface colours for a single colour scheme.
 *
 * Names and structure mirror the web token set in
 * `pkg/web/src/styles/globals.css` (`:root` light, `.dark` dark) so the two
 * apps stay visually in sync. Values are hex (not `oklch`) so the tokens are
 * safe to consume from React Native, which cannot parse `oklch()`.
 */
export type ThemeColors = {
  /** App backdrop behind all surfaces. */
  background: string;
  /** Default text/icon colour on `background`. */
  foreground: string;
  /** Raised surface (cards, sheets, list rows). */
  surface: string;
  /** Default text/icon colour on `surface`. */
  surfaceForeground: string;
  /** Subtle filled surface for inputs and secondary chrome. */
  muted: string;
  /** De-emphasised text (labels, captions, metadata). */
  mutedForeground: string;
  /** Hairline dividers and surface outlines. */
  border: string;
  /** Brand yellow used for primary actions and accents. */
  primary: string;
  /** Near-black text/icon colour that sits on `primary`. */
  primaryForeground: string;
};

/** Light scheme — neutral hex equivalents of the web `:root` `oklch` values. */
export const lightColors = {
  background: '#f7f7f7',
  foreground: '#0a0a0a',
  surface: '#ffffff',
  surfaceForeground: '#0a0a0a',
  muted: '#f5f5f5',
  mutedForeground: '#737373',
  border: '#e5e5e5',
  primary: JEDIDIAH_BRAND_YELLOW_ON_LIGHT,
  primaryForeground: '#0a0a0a',
} as const satisfies ThemeColors;

/** Dark scheme — reproduces the Bay Operator mockup palette. */
export const darkColors = {
  background: '#0a0a0b',
  foreground: '#fafafa',
  surface: '#141416',
  surfaceForeground: '#fafafa',
  muted: '#1b1b1f',
  mutedForeground: '#7a7a82',
  border: 'rgba(255, 255, 255, 0.08)',
  primary: JEDIDIAH_BRAND_YELLOW,
  primaryForeground: '#0a0a0a',
} as const satisfies ThemeColors;
