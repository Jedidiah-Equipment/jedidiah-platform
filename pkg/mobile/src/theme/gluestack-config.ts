import { darkStatusColors, hexToRgbTriplet, lightStatusColors } from '@pkg/domain';
import { vars } from 'nativewind';

import { primaryColorTriplets } from './brand-colors';
import type { ResolvedColorScheme } from './color-mode';

const mutedForegroundTriplets = { dark: '122 122 130', light: '115 115 115' } as const;
const backgroundTriplets = { dark: '10 10 11', light: '247 247 247' } as const;
const foregroundTriplets = { dark: '250 250 250', light: '10 10 10' } as const;
const mutedTriplets = { dark: '27 27 31', light: '245 245 245' } as const;
const borderColors = { dark: 'rgba(255, 255, 255, 0.08)', light: 'rgb(229 229 229)' } as const;
export const mutedForegroundColors = {
  dark: `rgb(${mutedForegroundTriplets.dark})`,
  light: `rgb(${mutedForegroundTriplets.light})`,
} as const satisfies Record<ResolvedColorScheme, string>;
export const foregroundColors = {
  dark: `rgb(${foregroundTriplets.dark})`,
  light: `rgb(${foregroundTriplets.light})`,
} as const satisfies Record<ResolvedColorScheme, string>;
export const mutedColors = {
  dark: `rgb(${mutedTriplets.dark})`,
  light: `rgb(${mutedTriplets.light})`,
} as const satisfies Record<ResolvedColorScheme, string>;
export const switchColors = {
  dark: {
    offTrack: mutedForegroundColors.dark,
    onTrack: `rgb(${primaryColorTriplets.dark})`,
    thumb: 'rgb(250 250 250)',
  },
  light: {
    offTrack: mutedForegroundColors.light,
    onTrack: `rgb(${primaryColorTriplets.light})`,
    thumb: 'rgb(255 255 255)',
  },
} as const satisfies Record<ResolvedColorScheme, { offTrack: string; onTrack: string; thumb: string }>;
export const navigationColors = {
  dark: {
    background: `rgb(${backgroundTriplets.dark})`,
    border: borderColors.dark,
    mutedForeground: mutedForegroundColors.dark,
    tabBarBackground: 'rgb(12 12 14)',
  },
  light: {
    background: `rgb(${backgroundTriplets.light})`,
    border: borderColors.light,
    mutedForeground: mutedForegroundColors.light,
    tabBarBackground: 'rgb(255 255 255)',
  },
} as const satisfies Record<
  ResolvedColorScheme,
  { background: string; border: string; mutedForeground: string; tabBarBackground: string }
>;

export const gluestackConfig = {
  dark: vars({
    '--color-background': backgroundTriplets.dark,
    '--color-border': borderColors.dark,
    '--color-danger': '248 113 113',
    '--color-danger-foreground': '10 10 10',
    '--color-elevated': '46 46 52',
    '--color-foreground': foregroundTriplets.dark,
    '--color-image-backdrop': '15 15 17',
    '--color-muted': mutedTriplets.dark,
    '--color-muted-foreground': mutedForegroundTriplets.dark,
    '--color-primary': primaryColorTriplets.dark,
    '--color-primary-foreground': '10 10 10',
    // Status accents derive from the shared hex palette (@pkg/domain) so the chips and the
    // inline-style bars/numbers stay in lockstep — one source of truth for the blue/green.
    '--color-status-in-progress': hexToRgbTriplet(darkStatusColors.inProgress),
    '--color-status-next': hexToRgbTriplet(darkStatusColors.next),
    '--color-status-next-soft': hexToRgbTriplet(darkStatusColors.nextSoft),
    '--color-status-scheduled': hexToRgbTriplet(darkStatusColors.scheduled),
    '--color-surface': '20 20 22',
    '--color-surface-foreground': '250 250 250',
  }),
  light: vars({
    '--color-background': backgroundTriplets.light,
    '--color-border': borderColors.light,
    '--color-danger': '248 113 113',
    '--color-danger-foreground': '10 10 10',
    '--color-elevated': '245 245 245',
    '--color-foreground': foregroundTriplets.light,
    '--color-image-backdrop': '15 15 17',
    '--color-muted': mutedTriplets.light,
    '--color-muted-foreground': mutedForegroundTriplets.light,
    '--color-primary': primaryColorTriplets.light,
    '--color-primary-foreground': '10 10 10',
    '--color-status-in-progress': hexToRgbTriplet(lightStatusColors.inProgress),
    '--color-status-next': hexToRgbTriplet(lightStatusColors.next),
    '--color-status-next-soft': hexToRgbTriplet(lightStatusColors.nextSoft),
    '--color-status-scheduled': hexToRgbTriplet(lightStatusColors.scheduled),
    '--color-surface': '255 255 255',
    '--color-surface-foreground': '10 10 10',
  }),
} satisfies Record<ResolvedColorScheme, ReturnType<typeof vars>>;
