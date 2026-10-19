import { type Db, user } from '@pkg/db';
import { activityViewFor, advanceActivityView } from '@pkg/domain';
import { ActivityViewMap, type AuthId, type Business, DateIso } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { mutateEntity } from '../audit/mutate-entity.js';
import { userNotFound } from './user-errors.js';
import { userAuditDescriptor } from './user-service.js';

/** The user's Activity View in one business: the newest feed instant they have received there. */
export async function getActivityView({
  db,
  userId,
  business,
}: {
  db: Db;
  userId: AuthId;
  business: Business;
}): Promise<DateIso> {
  const [account] = await db
    .select({ map: user.lastActivitySeen, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId));

  if (!account) throw userNotFound(userId);

  return activityViewFor(ActivityViewMap.parse(account.map), business, DateIso.parse(account.createdAt));
}

/**
 * Advances one business's mark through the newest item the caller says it displayed, clamped to the newest item
 * that business's feed holds for them (`latestActivityAt`, read only now): a caller may acknowledge an older
 * response, never a future instant that hides later entries. An empty feed leaves the mark where it is.
 */
export async function setActivityView({
  db,
  userId,
  business,
  seenAt,
  latestActivityAt,
}: {
  db: Db;
  userId: AuthId;
  business: Business;
  seenAt: DateIso;
  latestActivityAt: () => Promise<DateIso | null>;
}): Promise<DateIso> {
  const latest = await latestActivityAt();
  if (latest === null) return getActivityView({ db, userId, business });
  const validated = Date.parse(seenAt) <= Date.parse(latest) ? seenAt : latest;
  const read = (account: typeof user.$inferSelect) => ({
    map: ActivityViewMap.parse(account.lastActivitySeen),
    createdAt: DateIso.parse(account.createdAt),
  });

  return mutateEntity({
    actorUserId: userId,
    db,
    descriptor: userAuditDescriptor,
    id: userId,
    notFound: () => userNotFound(userId),
    project: (_tx, account) => {
      const { map, createdAt } = read(account);
      return activityViewFor(map, business, createdAt);
    },
    set: (account) => {
      const { map, createdAt } = read(account);
      const next = advanceActivityView(map, business, validated, createdAt);
      return next === map ? {} : { lastActivitySeen: next, updatedAt: new Date() };
    },
    table: user,
  });
}
