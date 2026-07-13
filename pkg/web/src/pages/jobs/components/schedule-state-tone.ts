/**
 * Canonical planning colors for a Work Slot's lifecycle, shared by the planning Gantt slot bars and
 * the schedule-state badges so both surfaces read identically: in-progress (running today) = blue,
 * scheduled (upcoming) = green, complete (past) = the theme's neutral. Defining the palette here once
 * keeps the Gantt and the Job List / hover-card badges from drifting apart.
 */

/** Badge-pill classes per Work-Slot lifecycle bucket. */
export const scheduleBadgeToneClass = {
  active: 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
  done: 'border-border bg-muted text-muted-foreground',
  scheduled: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
} as const;

/** Gantt slot-bar border + ring for the highlighted tones (neutral slots use the plain border). */
export const scheduleBarToneClass = {
  active: 'border-blue-500/60 ring-1 ring-blue-500/25',
  scheduled: 'border-emerald-500/70 ring-1 ring-emerald-500/25',
} as const;

/** Timeline status-dot fill; neutral covers complete and non-next future slots. */
export const scheduleDotToneClass = {
  active: 'bg-blue-500',
  neutral: 'bg-muted-foreground/40',
  scheduled: 'bg-emerald-500',
} as const;

/** Gantt resize-handle border/background for the highlighted tones. */
export const scheduleResizeHandleToneClass = {
  active: 'border-blue-500/70 bg-blue-500/15 hover:bg-blue-500/25 focus-visible:ring-blue-500',
  scheduled: 'border-emerald-500/70 bg-emerald-500/15 hover:bg-emerald-500/25 focus-visible:ring-emerald-500',
} as const;
