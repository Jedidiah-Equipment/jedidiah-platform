import { type Db, user } from '@pkg/db';
import type { QuickSwitchActorListResult } from '@pkg/schema/equipment';
import { QuickSwitchActorListResult as QuickSwitchActorListResultSchema } from '@pkg/schema/equipment';
import { asc } from 'drizzle-orm';

import { eligibleMovementPersonCondition } from './recipient-read.js';

/**
 * The names the stores tablet's Quick-switch offers: the same people the web Operator field and
 * Received by offer, so the tablet and the web agree on who may be named on a movement. The tablet's
 * own account is a device and drops out with the rest — `resolveMovementActor` refuses a device as the
 * actor, so its tile could only ever fail on the post.
 */
export async function listQuickSwitchActors({ db }: { db: Db }): Promise<QuickSwitchActorListResult> {
  const rows = await db
    .select({ id: user.id, name: user.name, thumbnailDataUrl: user.image })
    .from(user)
    .where(eligibleMovementPersonCondition())
    .orderBy(asc(user.name), asc(user.id));

  return QuickSwitchActorListResultSchema.parse({ items: rows });
}
