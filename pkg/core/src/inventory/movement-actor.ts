import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { AssertedActorDisabledError, AssertedActorNotFoundError } from './movement-actor-errors.js';

/**
 * Who a movement is stamped with, given who is signed in and who — if anyone — the caller asserted.
 *
 * This is the whole of "the device authorizes, the person attributes" (spec §11). Authorization has
 * already happened against the session by the time this runs, and this function never revisits it:
 * it does not read the asserted person's role or permissions, because doing so would turn a name tap
 * into a privilege change. All it decides is whose name the append-only ledger records.
 *
 * An asserted person who is unknown or disabled is refused rather than quietly ignored. Falling back
 * to the device session there would write a movement attributed to "Stores Tablet" while the person
 * standing at it believed they had signed for it — the one outcome the attribution exists to prevent.
 */
export async function resolveMovementActor({
  assertedActorUserId,
  db,
  sessionUserId,
}: {
  assertedActorUserId: AuthId | null | undefined;
  db: DatabaseTransaction | Db;
  sessionUserId: AuthId;
}): Promise<AuthId> {
  if (assertedActorUserId === null || assertedActorUserId === undefined) return sessionUserId;

  const [actor] = await db
    .select({ banned: user.banned, id: user.id })
    .from(user)
    .where(eq(user.id, assertedActorUserId));

  if (!actor) throw new AssertedActorNotFoundError(assertedActorUserId);
  if (actor.banned === true) throw new AssertedActorDisabledError(assertedActorUserId);

  return actor.id;
}
