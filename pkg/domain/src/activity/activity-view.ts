import type { ActivityViewMap, Business, DateIso } from '@pkg/schema';

/** The mark a business reads for a user: its key, or the account's creation when the key was never set. */
export const activityViewFor = (map: ActivityViewMap, business: Business, createdAt: DateIso): DateIso =>
  map[business] ?? createdAt;

/**
 * The map after acknowledging `seenAt` in one business: forward only, so an older acknowledgement keeps the map.
 * The caller clamps `seenAt` to the newest item its feed holds.
 */
export function advanceActivityView(
  map: ActivityViewMap,
  business: Business,
  seenAt: DateIso,
  createdAt: DateIso,
): ActivityViewMap {
  return Date.parse(seenAt) <= Date.parse(activityViewFor(map, business, createdAt))
    ? map
    : { ...map, [business]: seenAt };
}

/** Whether the newest feed entry lies beyond the user's Activity high-water mark. */
export function hasUnreadActivity({
  lastActivitySeen,
  latestActivityAt,
}: {
  lastActivitySeen: DateIso;
  latestActivityAt: DateIso | null;
}): boolean {
  return latestActivityAt !== null && Date.parse(latestActivityAt) > Date.parse(lastActivitySeen);
}
