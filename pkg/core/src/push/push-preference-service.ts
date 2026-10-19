import { type Db, user } from '@pkg/db';
import { type AuthId, type PushKind, PushKindSchema, type PushPreferences, PushPreferencesSetInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { mutateEntity } from '../audit/mutate-entity.js';
import { userNotFound } from '../users/user-errors.js';
import { userAuditDescriptor } from '../users/user-service.js';
import { refuseDeviceAccount } from './push-errors.js';

// A kind retired from the registry may linger in a stored list; it reads as never muted rather than failing the page.
const knownKinds = (stored: readonly string[]): PushKind[] =>
  stored.filter((kind): kind is PushKind => PushKindSchema.safeParse(kind).success);

export async function getPushPreferences({ db, userId }: { db: Db; userId: AuthId }): Promise<PushPreferences> {
  const [row] = await db
    .select({ muted: user.mutedPushKinds, isDevice: user.isDevice })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) throw userNotFound(userId);
  refuseDeviceAccount(row);
  return { muted: knownKinds(row.muted) };
}

/** Replaces the User's muted Push Kinds; an audited User fact, recorded only when the set changes. */
export function setPushPreferences({
  db,
  userId,
  input: raw,
}: {
  db: Db;
  userId: AuthId;
  input: PushPreferencesSetInput;
}): Promise<PushPreferences> {
  const muted = [...new Set(PushPreferencesSetInput.parse(raw).muted)].sort();
  return mutateEntity({
    actorUserId: userId,
    assert: (_tx, account) => refuseDeviceAccount(account),
    db,
    descriptor: userAuditDescriptor,
    id: userId,
    notFound: () => userNotFound(userId),
    project: (_tx, account) => ({ muted: knownKinds(account.mutedPushKinds) }),
    // The audit diff compares arrays by identity, so an unchanged set must write nothing.
    set: (account) =>
      account.mutedPushKinds.join() === muted.join() ? {} : { mutedPushKinds: muted, updatedAt: new Date() },
    table: user,
  });
}
