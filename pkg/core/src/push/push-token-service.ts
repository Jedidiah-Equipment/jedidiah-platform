import { type Db, pushTokens, session, user } from '@pkg/db';
import { PushTokenRegisterInput } from '@pkg/schema';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { PushError } from './push-errors.js';

/**
 * Records that this install may be pinged for `userId` while `sessionId` lasts. A token is one phone, so a second
 * user signing in on it takes the row over: pushes follow whoever signed in last, and stop when that session ends.
 * A shared device account never registers. There is no unregister: the row cascades away with its session.
 */
export async function registerPushToken({
  db,
  userId,
  sessionId,
  input: raw,
}: {
  db: Db;
  userId: string;
  sessionId: string;
  input: PushTokenRegisterInput;
}): Promise<void> {
  const input = PushTokenRegisterInput.parse(raw);
  const [account] = await db.select({ isDevice: user.isDevice }).from(user).where(eq(user.id, userId));
  if (account?.isDevice)
    throw new PushError('push.device_account', 'A shared device account does not receive notifications.');
  await db
    .insert(pushTokens)
    .values({ userId, sessionId, token: input.token, platform: input.platform })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId, sessionId, platform: input.platform, lastSeenAt: sql`now()` },
    });
}

/** The installs these users can be pinged on: only those whose registering session has not expired. */
export async function listPushTokensForUsers({
  db,
  userIds,
}: {
  db: Db;
  userIds: readonly string[];
}): Promise<{ userId: string; token: string }[]> {
  if (userIds.length === 0) return [];
  return db
    .select({ userId: pushTokens.userId, token: pushTokens.token })
    .from(pushTokens)
    .innerJoin(session, and(eq(session.id, pushTokens.sessionId), gt(session.expiresAt, sql`now()`)))
    .where(inArray(pushTokens.userId, [...userIds]))
    .orderBy(pushTokens.userId, pushTokens.token);
}

/** Drops tokens the push service reported as gone, so the next send skips them. */
export async function prunePushTokens({ db, tokens }: { db: Db; tokens: readonly string[] }): Promise<number> {
  if (tokens.length === 0) return 0;
  const removed = await db
    .delete(pushTokens)
    .where(inArray(pushTokens.token, [...tokens]))
    .returning({ id: pushTokens.id });
  return removed.length;
}
