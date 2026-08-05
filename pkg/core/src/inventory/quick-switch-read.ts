import { type Db, user } from '@pkg/db';
import type { AuthId, QuickSwitchActorListResult } from '@pkg/schema';
import { QuickSwitchActorListResult as QuickSwitchActorListResultSchema } from '@pkg/schema';
import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';

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
  excludeUserId,
}: {
  db: Db;
  /**
   * The signed-in account, left off the list. The tablet itself holds the `stores` role — that is
   * how it authorizes these flows at all — so without this it would offer "Stores Tablet" as a
   * person to work as, and tapping it would attribute a movement to the device. That is precisely
   * the outcome the attribution rule exists to prevent, so the device must not be selectable.
   */
  excludeUserId?: AuthId;
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
        excludeUserId === undefined ? undefined : ne(user.id, excludeUserId),
      ),
    )
    .orderBy(asc(user.name), asc(user.id));

  return QuickSwitchActorListResultSchema.parse({ items: rows });
}
