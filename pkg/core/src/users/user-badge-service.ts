import { type Db, user } from '@pkg/db';
import type { AuthId, UserBadgePdfModel, UserBadgePdfRenderer } from '@pkg/schema';
import { UserBadgePdfModel as UserBadgePdfModelSchema } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { UserNotFoundError } from './user-errors.js';

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
  const [row] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  if (!row) throw new UserNotFoundError(userId);

  const badge: UserBadgePdfModel = UserBadgePdfModelSchema.parse(row);
  const filename = `${badge.id}-stores-badge.pdf`;

  return { bytes: await pdfRenderer({ document: [badge], filename }), filename };
}
