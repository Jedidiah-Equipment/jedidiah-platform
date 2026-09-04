import { type Db, user } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import type { UserBadgePdfModel, UserBadgePdfRenderer } from '@pkg/schema/equipment';
import { UserBadgePdfModel as UserBadgePdfModelSchema } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';

import { UserIsDeviceError, UserNotFoundError } from './user-errors.js';

export type UserBadgePdfResult = {
  bytes: Uint8Array;
  filename: string;
};

/**
 * The printable badge card for one person (spec §11).
 *
 * Deliberately not scoped to the `stores` role even though the quick-switch is: reprinting is an
 * administrative act on a user, and a role changed the day before a card is printed would otherwise
 * make the button vanish exactly when it is needed. What the card *does* is still bounded by the
 * quick-switch, which only ever offers stores people.
 *
 * A shared device is the one account refused outright — it can never be the actor on a movement, so
 * its card could only ever be rejected at the scan field.
 */
export async function renderUserBadge({
  db,
  pdfRenderer,
  userId,
}: {
  db: Db;
  pdfRenderer: UserBadgePdfRenderer;
  userId: AuthId;
}): Promise<UserBadgePdfResult> {
  const [row] = await db
    .select({ id: user.id, isDevice: user.isDevice, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) throw new UserNotFoundError(userId);
  if (row.isDevice) throw new UserIsDeviceError(userId);

  const badge: UserBadgePdfModel = UserBadgePdfModelSchema.parse(row);
  const filename = `${badge.id}-stores-badge.pdf`;

  return { bytes: await pdfRenderer({ document: [badge], filename }), filename };
}
