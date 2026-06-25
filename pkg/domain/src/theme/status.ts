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

/** Days-left urgency palette: red when imminent, amber when soon. */
export const DAYS_LEFT_URGENT = '#f87171';
export const DAYS_LEFT_SOON = '#fbbf24';

const statusColorsByScheme = {
  light: lightStatusColors,
  dark: darkStatusColors,
} as const satisfies Record<'light' | 'dark', StatusColors>;

/** The work states a days-left figure can carry: a Job running today, or one still queued. */
export type WorkProgressStatus = 'in-progress' | 'scheduled';

/**
 * Colour for a days-left countdown and its progress bar, by urgency then status: red at `<= 2`,
 * amber at `<= 5`, otherwise the in-progress blue (theme-aware) or the scheduled green. Urgency
 * always wins, so a Job finishing imminently reads red whether it is running or queued. The single
 * source for the bar/number accents — the in-progress blue matches the in-progress status chip.
 */
export function statusDaysLeftColor({
  status,
  daysLeft,
  scheme,
}: {
  status: WorkProgressStatus;
  daysLeft: number;
  scheme: 'light' | 'dark';
}): string {
  if (daysLeft <= 2) return DAYS_LEFT_URGENT;
  if (daysLeft <= 5) return DAYS_LEFT_SOON;

  return status === 'in-progress' ? statusColorsByScheme[scheme].inProgress : statusColorsByScheme[scheme].next;
}
