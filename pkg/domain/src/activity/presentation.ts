import type { StatusBadgeColor } from '../theme/status-badge.js';

/** How often an open feed, or the unread dot beside its nav item or tab, picks up activity recorded elsewhere. */
export const ACTIVITY_REFETCH_INTERVAL_MS = 60_000;

/**
 * How an event entry reads in either business's feed: who did it, what they did, the fact beyond that, and the
 * colour its icon chip takes. Each app supplies only the icon; the entry's shape is shared.
 */
export type ActivityEventPresentation = {
  actorName: string;
  /** What the actor did, read after their name. */
  sentence: string;
  /** The fact beyond the sentence, or null when there is none. */
  detail: string | null;
  tone: StatusBadgeColor;
};
