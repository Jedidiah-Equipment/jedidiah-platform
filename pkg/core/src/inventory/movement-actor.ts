import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import { eq, inArray } from 'drizzle-orm';

import {
  AssertedActorDisabledError,
  AssertedActorNotFoundError,
  DeviceActorAssertedError,
  DeviceActorRequiredError,
} from './movement-actor-errors.js';

/**
 * Who a movement is stamped with, given who is signed in and who — if anyone — the caller asserted.
 *
 * This is the whole of "the device authorizes, the person attributes" (spec §11), and it is the
 * boundary that rule lives at. Authorization has already happened against the session by the time
 * this runs, and this never revisits it: it does not read the asserted person's role or permissions,
 * because doing so would turn a name tap into a privilege change. All it decides is whose name the
 * append-only ledger records.
 *
 * Three refusals, each preventing a movement whose recorded actor would be a lie:
 *
 * - A shared device that named nobody. "No person, no movements" is a rule about the record, so it
 *   is asserted here rather than left to a disabled button — a button is UX, and the ledger keeps
 *   its row forever.
 * - A device named as the actor. A device is not somebody; attributing stock to one says a machine
 *   fetched it.
 * - An unknown or disabled person. Falling back to the device there would write a movement signed
 *   "Stores Tablet" while the person standing at it believed they had signed for it themselves.
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
  const asserted = assertedActorUserId ?? null;
  // One read covers both accounts: whether the session is a device decides if an actor is required
  // at all, and it is required far too often to be worth a second round trip.
  const rows = await db
    .select({ banned: user.banned, id: user.id, isDevice: user.isDevice })
    .from(user)
    .where(inArray(user.id, asserted === null ? [sessionUserId] : [sessionUserId, asserted]));

  const session = rows.find((row) => row.id === sessionUserId);

  if (asserted === null) {
    // An unknown session is not this function's failure to report — the request authorized, so the
    // account exists; treating a missing row as "not a device" keeps every web surface unchanged.
    if (session?.isDevice === true) throw new DeviceActorRequiredError(sessionUserId);

    return sessionUserId;
  }

  const actor = asserted === sessionUserId ? session : rows.find((row) => row.id === asserted);

  if (!actor) throw new AssertedActorNotFoundError(asserted);
  if (actor.isDevice) throw new DeviceActorAssertedError(asserted);
  if (actor.banned === true) throw new AssertedActorDisabledError(asserted);

  return actor.id;
}
