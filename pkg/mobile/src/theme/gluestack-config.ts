import { darkStatusColors, hexToRgbTriplet, lightStatusColors } from '@pkg/domain';
import { vars } from 'nativewind';

import { primaryColorTriplets } from './brand-colors';
import type { ResolvedColorScheme } from './color-mode';

const mutedForegroundTriplets = { dark: '122 122 130', light: '115 115 115' } as const;
export const mutedForegroundColors = {
  dark: `rgb(${mutedForegroundTriplets.dark})`,
  light: `rgb(${mutedForegroundTriplets.light})`,
} as const satisfies Record<ResolvedColorScheme, string>;

export const gluestackConfig = {
  dark: vars({
    '--color-background': '10 10 11',
    '--color-border': 'rgba(255, 255, 255, 0.08)',
    '--color-danger': '248 113 113',
    '--color-elevated': '46 46 52',
    '--color-foreground': '250 250 250',
    '--color-muted': '27 27 31',
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
    '--color-background': '247 247 247',
    '--color-border': 'rgb(229 229 229)',
    '--color-danger': '248 113 113',
    '--color-elevated': '245 245 245',
    '--color-foreground': '10 10 10',
    '--color-muted': '245 245 245',
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
