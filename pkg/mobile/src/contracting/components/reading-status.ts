import { IconAlertTriangle, IconCheck, IconClock } from '@tabler/icons-react-native';
import type { QueuedReading } from '@/contracting/readings/reading-queue';

export const readingStatuses = {
  attention: { label: 'Needs attention', icon: IconAlertTriangle, className: 'text-danger' },
  queued: { label: 'Queued', icon: IconClock, className: 'text-muted-foreground' },
  synced: { label: 'Synced', icon: IconCheck, className: 'text-status-next' },
} as const;

/** A capture still on the phone needs attention or is queued; no local capture means the reading is synced. */
export function queuedReadingStatus(row: Pick<QueuedReading, 'attention'> | undefined) {
  if (row?.attention) return readingStatuses.attention;
  return row ? readingStatuses.queued : readingStatuses.synced;
}
