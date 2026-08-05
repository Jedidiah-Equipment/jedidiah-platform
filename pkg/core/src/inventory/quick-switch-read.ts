import { type Db, user } from '@pkg/db';
import type { AuthId, QuickSwitchActorListResult } from '@pkg/schema';
import { QuickSwitchActorListResult as QuickSwitchActorListResultSchema } from '@pkg/schema';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

/**
 * The names the stores tablet's quick-switch offers (spec §11).
 *
 * Scoped to the `stores` role rather than to "anyone who could post a movement", and that is the
 * point: the tablet is the stores surface, and the grid is a shift's worth of names to tap. Widening
 * it to every role holding `inventory:move` would put procurement and admin faces on a shared
 * warehouse screen, which is a directory of the office rather than a way to sign for stock.
 *
 * Disabled accounts are excluded here for the same reason `resolveMovementActor` refuses them on the
 * write: a name that cannot be attributed to should never be offered.
 */
export async function listQuickSwitchActors({
  db,
  deviceUserId,
}: {
  db: Db;
  /**
   * The signed-in account, sorted to the head of the list rather than dropped from it.
   *
   * The tablet itself holds the `stores` role — that is how it authorizes these flows at all — so
   * it matches this query like any other name. Keeping it, first, makes "nobody is claiming this
   * one" a deliberate tile somebody taps rather than a state they fall into: the server already
   * attributes an unnamed post to the device session, so hiding the account did not prevent that
   * outcome, it only made the one honest way to choose it invisible.
   */
  deviceUserId?: AuthId;
}): Promise<QuickSwitchActorListResult> {
  const rows = await db
    .select({ id: user.id, name: user.name, thumbnailDataUrl: user.image })
    .from(user)
    .where(
      and(
        eq(user.role, 'stores'),
        // `banned` is nullable on the auth table, and `<> true` drops NULL rows in SQL — which
        // would hide every account Better Auth created before the column had a default.
        or(isNull(user.banned), eq(user.banned, false)),
      ),
    )
    // The device first, then people by name. `desc` because Postgres sorts false before true, and
    // the term is omitted entirely when there is no device — `order by true` is an ordinal
    // reference in Postgres, not a constant, and errors.
    .orderBy(
      ...(deviceUserId === undefined ? [] : [sql`(${user.id} = ${deviceUserId}) desc`]),
      asc(user.name),
      asc(user.id),
    );

  return QuickSwitchActorListResultSchema.parse({ items: rows });
}
