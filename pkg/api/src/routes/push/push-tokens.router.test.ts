import { type Db, pushTokens, user } from '@pkg/db';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => ({ db }));
const token = 'ExponentPushToken[workshop-phone]';

async function seedActor(db: Db, isDevice = false) {
  const now = new Date();
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Wendy',
    email: 'push@example.com',
    emailVerified: true,
    contractingRole: 'workshop-manager',
    isDevice,
    createdAt: now,
    updatedAt: now,
  });
}

describe('pushTokens', () => {
  test('a signed-in person registers and unregisters their install', async ({ context }) => {
    const { db } = context;
    await seedActor(db);
    const caller = context.createCaller(mockSession(null));

    await caller.pushTokens.register({ token, platform: 'android' });
    expect(await db.select({ userId: pushTokens.userId }).from(pushTokens)).toEqual([{ userId: 'test-user-id' }]);

    await caller.pushTokens.unregister({ token });
    expect(await db.select().from(pushTokens)).toEqual([]);
  });

  test('a shared device account is refused with the push app code', async ({ context }) => {
    await seedActor(context.db, true);

    await expect(
      context.createCaller(mockSession(null)).pushTokens.register({ token, platform: 'ios' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', appCode: 'push.device_account' });
  });
});
