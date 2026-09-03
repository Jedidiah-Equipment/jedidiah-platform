import { type JobStatusTone, statusBadgeColorClassNames } from '@pkg/domain';

import { StatusBadge, type StatusBadgeClassNames } from '@/components/ui/status-badge';

/** The semantic accent a board status chip, dot, or label carries. */
export type StatusTone = JobStatusTone;

/**
 * `cancelled` is not a board work state — a cancelled Slot is still whatever it was scheduled as —
 * so it rides beside the work tones rather than inside {@link StatusTone}.
 */
export type ChipTone = StatusTone | 'cancelled';

/**
 * Tailwind class fragments per status tone — the single source for the chip/dot/label accents the
 * Bay and Job board screens share, so a status colour is declared once instead of restated inline.
 */
export const STATUS_TONE: Record<ChipTone, StatusBadgeClassNames & { dot: string }> = {
  'in-progress': { ...statusBadgeColorClassNames.blue, dot: 'bg-status-in-progress' },
  next: { ...statusBadgeColorClassNames.green, dot: 'bg-status-next' },
  muted: { ...statusBadgeColorClassNames.gray, dot: 'bg-muted-foreground' },
  cancelled: statusBadgeColorClassNames.orange,
};

/** The shared status badge used by the Bay slot and Job detail panes. */
export function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  const classes = STATUS_TONE[tone];

  return <StatusBadge classNames={classes} label={label} />;
}

/** The days-left badge matches the adjacent work-state badge exactly. */
export function DaysLeftChip({ tone, daysLeft }: { tone: ChipTone; daysLeft: number }) {
  return (
    <StatusBadge classNames={STATUS_TONE[tone]} label={`${daysLeft} working ${daysLeft === 1 ? 'day' : 'days'} left`} />
  );
}
