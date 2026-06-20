/**
 * Semantic status + days-left accents shared by the Bay Operator screens.
 *
 * Sourced from the prototype (`docs/design/bay-operator-mobile/project/BayApp.dc.html`):
 * `statusColor` for the in-progress/scheduled pills, `nodeColor`/`labelColor`
 * for the up-next timeline, and `dayColor` for the days-left countdown.
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

/** Days-left countdown palette: urgent → comfortable. */
export const DAYS_LEFT_URGENT = '#f87171';
export const DAYS_LEFT_SOON = '#fbbf24';
export const DAYS_LEFT_OK = '#5fcf87';

/**
 * Colour for a days-left countdown: red at `<= 2`, amber at `<= 5`, else green.
 * Mirrors `dayColor` in the prototype.
 */
export function daysLeftColor(daysLeft: number): string {
  if (daysLeft <= 2) return DAYS_LEFT_URGENT;
  if (daysLeft <= 5) return DAYS_LEFT_SOON;
  return DAYS_LEFT_OK;
}
