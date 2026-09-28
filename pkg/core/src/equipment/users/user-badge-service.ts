import { type Db, user } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import type { UserBadgePdfModel, UserBadgePdfRenderer } from '@pkg/schema/equipment';
import { UserBadgePdfModel as UserBadgePdfModelSchema } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';

import { UserNotFoundError } from '../../users/user-errors.js';
import { UserIsDeviceError } from './user-errors.js';

export type UserBadgePdfResult = {
  bytes: Uint8Array;
  filename: string;
};

/**
 * The printable Badge Card for one person. Anyone the Quick-switch can name may carry one,
 * and what the card *does* stays bounded by that list: a card for someone it does not offer is refused
 * at the scan field, the same as a name the post would refuse.
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
