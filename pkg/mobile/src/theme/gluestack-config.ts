import { vars } from 'nativewind';

import type { ResolvedColorScheme } from './color-mode';

export const gluestackConfig = {
  dark: vars({
    '--color-background': '10 10 11',
    '--color-border': 'rgba(255, 255, 255, 0.08)',
    '--color-danger': '248 113 113',
    '--color-elevated': '46 46 52',
    '--color-foreground': '250 250 250',
    '--color-muted': '27 27 31',
    '--color-muted-foreground': '122 122 130',
    '--color-primary': '255 240 0',
    '--color-primary-foreground': '10 10 10',
    '--color-status-in-progress': '96 165 250',
    '--color-status-next': '34 197 94',
    '--color-status-next-soft': '95 207 135',
    '--color-status-scheduled': '251 191 36',
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
    '--color-muted-foreground': '115 115 115',
    '--color-primary': '248 211 0',
    '--color-primary-foreground': '10 10 10',
    '--color-status-in-progress': '59 130 246',
    '--color-status-next': '34 197 94',
    '--color-status-next-soft': '95 207 135',
    '--color-status-scheduled': '251 191 36',
    '--color-surface': '255 255 255',
    '--color-surface-foreground': '10 10 10',
  }),
} satisfies Record<ResolvedColorScheme, ReturnType<typeof vars>>;
