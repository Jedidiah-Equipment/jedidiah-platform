import { type Db, eq, pushTokens, session, user } from '@pkg/db';
import { describe, expect } from 'vitest';
import { createTester } from '../test/create-tester.js';
import { isPushError } from './push-errors.js';
import { deliverPush, type PushMessage } from './push-sender.js';
import { listPushTokensForUsers, registerPushToken } from './push-token-service.js';

const test = createTester();

const tokenA = 'ExponentPushToken[phone-a]';
const tokenB = 'ExponentPushToken[phone-b]';

async function seedUsers(db: Db) {
  const now = new Date();
  const person = (id: string, isDevice = false) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    isDevice,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(user).values([person('anna'), person('ben'), person('tablet', true)]);
  // One live session each, named after its user.
  await db.insert(session).values(
    ['anna', 'ben', 'tablet'].map((id) => ({
      id,
      userId: id,
      token: `${id}-session`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    })),
  );
}

const tokensOf = async (db: Db) =>
  (await db.select({ userId: pushTokens.userId, token: pushTokens.token }).from(pushTokens)).sort((a, b) =>
    a.token.localeCompare(b.token),
  );

describe('push tokens', () => {
  test('a shared device account cannot register', async ({ context: { db } }) => {
    await seedUsers(db);

    const refused = await registerPushToken({
      db,
      userId: 'tablet',
      sessionId: 'tablet',
      input: { token: tokenA, platform: 'android' },
    }).catch((error: unknown) => error);

    expect(isPushError(refused) && refused.code).toBe('push.device_account');
    expect(await tokensOf(db)).toEqual([]);
  });

  test('a token follows whoever signed in last on the phone', async ({ context: { db } }) => {
    await seedUsers(db);

    await registerPushToken({ db, userId: 'anna', sessionId: 'anna', input: { token: tokenA, platform: 'ios' } });
    await registerPushToken({ db, userId: 'ben', sessionId: 'ben', input: { token: tokenA, platform: 'ios' } });

    expect(await tokensOf(db)).toEqual([{ userId: 'ben', token: tokenA }]);
  });

  test('an install stops being pinged when the session that registered it ends', async ({ context: { db } }) => {
    await seedUsers(db);
    await registerPushToken({ db, userId: 'anna', sessionId: 'anna', input: { token: tokenA, platform: 'ios' } });
    await registerPushToken({ db, userId: 'ben', sessionId: 'ben', input: { token: tokenB, platform: 'android' } });

    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.id, 'anna'));
    await db.delete(session).where(eq(session.id, 'ben'));

    expect(await listPushTokensForUsers({ db, userIds: ['anna', 'ben'] })).toEqual([]);
    expect((await tokensOf(db)).map((row) => row.userId)).toEqual(['anna']);
  });

  test('delivery prunes only the installs reported gone', async ({ context: { db } }) => {
    await seedUsers(db);
    await registerPushToken({ db, userId: 'anna', sessionId: 'anna', input: { token: tokenA, platform: 'ios' } });
    await registerPushToken({ db, userId: 'ben', sessionId: 'ben', input: { token: tokenB, platform: 'android' } });
    const tokenC = 'ExponentPushToken[phone-c]';
    await registerPushToken({ db, userId: 'ben', sessionId: 'ben', input: { token: tokenC, platform: 'android' } });
    const message = (to: string): PushMessage => ({ to, title: 't', body: 'b', data: {} });

    const delivery = await deliverPush({
      db,
      messages: [message(tokenA), message(tokenB), message(tokenC)],
      sender: async () => [
        { to: tokenA, ok: true },
        { to: tokenB, ok: false, error: 'DeviceNotRegistered' },
        { to: tokenC, ok: false, error: 'MessageRateExceeded' },
      ],
    });

    expect(delivery).toEqual({ sent: 1, pruned: 1, failed: 1, failures: { MessageRateExceeded: 1 } });
    expect((await tokensOf(db)).map((row) => row.token)).toEqual([tokenA, tokenC]);
  });
});
