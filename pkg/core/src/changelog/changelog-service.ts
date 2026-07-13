import { changelogView, type Db } from '@pkg/db';
import type { AppEnv, Changelog } from '@pkg/schema';
import { eq, lt } from 'drizzle-orm';

import { selectUnseenChangelogs } from './changelog-visibility.js';

/**
 * Returns the Changelogs the caller has not yet acknowledged, oldest-first, after applying every
 * visibility rule. `changelogs` are supplied by the caller (the router's injectable loader) so this
 * read stays independent of the filesystem.
 */
export async function getUnseenChangelogs({
  db,
  changelogs,
  appEnv,
  userId,
  accountCreatedAt,
  now = new Date(),
}: {
  db: Db;
  changelogs: readonly Changelog[];
  appEnv: AppEnv;
  userId: string;
  accountCreatedAt: Date;
  now?: Date;
}): Promise<Changelog[]> {
  const [view] = await db
    .select({ lastSeenReleaseAt: changelogView.lastSeenReleaseAt })
    .from(changelogView)
    .where(eq(changelogView.userId, userId));

  return selectUnseenChangelogs({
    appEnv,
    changelogs,
    now,
    accountCreatedAt,
    lastSeenReleaseAt: view?.lastSeenReleaseAt ?? null,
  });
}

/**
 * Advances the caller's Changelog View high-water mark to `releasedAt`. The mark only ever moves
 * forward: a call with an older or equal `releasedAt` leaves the stored value untouched.
 */
export async function markChangelogSeen({
  db,
  userId,
  releasedAt,
}: {
  db: Db;
  userId: string;
  releasedAt: Date;
}): Promise<void> {
  await db
    .insert(changelogView)
    .values({ userId, lastSeenReleaseAt: releasedAt, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: changelogView.userId,
      set: { lastSeenReleaseAt: releasedAt, updatedAt: new Date() },
      setWhere: lt(changelogView.lastSeenReleaseAt, releasedAt),
    });
}
