import { changelogView, type Db } from '@pkg/db';
import type { AppEnv, Business, Changelog } from '@pkg/schema';
import { and, eq, lt } from 'drizzle-orm';

import { UnknownChangelogReleaseError } from './changelog-errors.js';
import { selectUnseenChangelogs } from './changelog-visibility.js';

/**
 * Returns the Changelogs of `business` the caller has not yet acknowledged, oldest-first, after
 * applying every visibility rule. `changelogs` are supplied by the caller (the router's injectable
 * loader) so this read stays independent of the filesystem.
 */
export async function getUnseenChangelogs({
  db,
  changelogs,
  appEnv,
  business,
  userId,
  accountCreatedAt,
  now = new Date(),
}: {
  db: Db;
  changelogs: readonly Changelog[];
  appEnv: AppEnv;
  business: Business;
  userId: string;
  accountCreatedAt: Date;
  now?: Date;
}): Promise<Changelog[]> {
  const [view] = await db
    .select({ lastSeenReleaseAt: changelogView.lastSeenReleaseAt })
    .from(changelogView)
    .where(and(eq(changelogView.userId, userId), eq(changelogView.business, business)));

  return selectUnseenChangelogs({
    appEnv,
    business,
    changelogs,
    now,
    accountCreatedAt,
    lastSeenReleaseAt: view?.lastSeenReleaseAt ?? null,
  });
}

/**
 * Advances the caller's Changelog View high-water mark for `business` to `releasedAt`. `releasedAt`
 * must match a real released Changelog of that business — this rejects a stray or future value, or a
 * release from the other business's log, that would otherwise suppress every future announcement for
 * the user. The mark only ever moves forward: an older or equal `releasedAt` leaves the stored value
 * untouched.
 */
export async function markChangelogSeen({
  db,
  userId,
  business,
  releasedAt,
  changelogs,
}: {
  db: Db;
  userId: string;
  business: Business;
  releasedAt: Date;
  changelogs: readonly Changelog[];
}): Promise<void> {
  const isReleased = changelogs.some(
    (changelog) => changelog.business === business && new Date(changelog.releasedAt).getTime() === releasedAt.getTime(),
  );
  if (!isReleased) throw new UnknownChangelogReleaseError(releasedAt.toISOString());

  await db
    .insert(changelogView)
    .values({ userId, business, lastSeenReleaseAt: releasedAt, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [changelogView.userId, changelogView.business],
      set: { lastSeenReleaseAt: releasedAt, updatedAt: new Date() },
      setWhere: lt(changelogView.lastSeenReleaseAt, releasedAt),
    });
}
