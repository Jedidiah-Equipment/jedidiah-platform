import type { JobStatusTone } from '@pkg/domain';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

/** The semantic accent a board status chip, dot, or label carries. */
export type StatusTone = JobStatusTone;

/**
 * Tailwind class fragments per status tone — the single source for the chip/dot/label accents the
 * Bay and Job board screens share, so a status colour is declared once instead of restated inline.
 */
export const STATUS_TONE: Record<StatusTone, { chip: string; dot: string; text: string }> = {
  'in-progress': {
    chip: 'border-status-in-progress/30 bg-status-in-progress/10',
    dot: 'bg-status-in-progress',
    text: 'text-status-in-progress',
  },
  next: {
    chip: 'border-status-next/30 bg-status-next/10',
    dot: 'bg-status-next',
    text: 'text-status-next',
  },
  muted: {
    chip: 'border-muted-foreground/30 bg-muted-foreground/10',
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
  },
};

/** A bordered status pill with a leading dot — shared by the Bay slot and Job detail panes. */
export function StatusChip({ tone, label }: { tone: StatusTone; label: string }) {
  const classes = STATUS_TONE[tone];

  return (
    <View className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${classes.chip}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />
      <Text className={`text-[10px] tracking-wide ${classes.text}`} weight="semibold">
        {label}
      </Text>
    </View>
  );
}

/** Tints a chip from a solid accent at low opacity (1A/4D ≈ 10%/30% alpha). */
function chipTint(color: string) {
  return { backgroundColor: `${color}1A`, borderColor: `${color}4D` };
}

/** The 'N WORKING DAY(S) LEFT' countdown pill, tinted from the shared days-left accent. */
export function DaysLeftChip({ color, daysLeft }: { color: string; daysLeft: number }) {
  return (
    <View className="rounded-full border px-2.5 py-1" style={chipTint(color)}>
      <Text className="text-[10px] tracking-wide" mono style={{ color }} weight="semibold">
        {daysLeft} WORKING {daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT
      </Text>
    </View>
  );
}
