import { darkColors, lightColors } from './colors.js';

/**
 * Semantic status accents shared by the Bay Operator screens.
 *
 * Sourced from the prototype (`docs/design/bay-operator-mobile/project/BayApp.dc.html`):
 * `statusColor` for the in-progress/scheduled pills and `nodeColor`/`labelColor`
 * for the up-next timeline.
 */
export type StatusColors = {
  /** Active job ("In progress") accent. */
  inProgress: string;
  /** Queued job ("Scheduled") accent. */
  scheduled: string;
  /** The immediately-next queued job — timeline node / emphasis. */
  next: string;
  /** Softer green used for next-job text labels. */
  nextSoft: string;
};

/** In-progress blue darkens on light surfaces; the rest are shared accents. */
export const lightStatusColors = {
  inProgress: '#3b82f6',
  scheduled: '#fbbf24',
  next: '#22c55e',
  nextSoft: '#5fcf87',
} as const satisfies StatusColors;

export const darkStatusColors = {
  inProgress: '#60a5fa',
  scheduled: '#fbbf24',
  next: '#22c55e',
  nextSoft: '#5fcf87',
} as const satisfies StatusColors;

const statusColorsByScheme = {
  light: lightStatusColors,
  dark: darkStatusColors,
} as const satisfies Record<'light' | 'dark', StatusColors>;

const neutralColorsByScheme = {
  light: lightColors.mutedForeground,
  dark: darkColors.mutedForeground,
} as const;

export type JobStatusTone = 'in-progress' | 'next' | 'muted';
export type WorkProgressStatus = 'in-progress' | 'scheduled';

export function resolveJobStatusTone({
  isNext,
  status,
}: {
  isNext: boolean;
  status: WorkProgressStatus;
}): JobStatusTone {
  if (status === 'in-progress') return 'in-progress';
  return isNext ? 'next' : 'muted';
}

/**
 * Canonical Job accent for days-left figures and progress bars: active work is blue, the next Job
 * is green, and every other state uses the theme's neutral foreground.
 */
export function jobStatusAccentColor(tone: JobStatusTone, scheme: 'light' | 'dark'): string {
  if (tone === 'in-progress') return statusColorsByScheme[scheme].inProgress;
  if (tone === 'next') return statusColorsByScheme[scheme].next;
  return neutralColorsByScheme[scheme];
}
