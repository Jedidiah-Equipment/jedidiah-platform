import { type Db, user } from '@pkg/db';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => ({ db }));
const token = 'ExponentPushToken[workshop-phone]';

async function seedDeviceAccount(db: Db) {
  const now = new Date();
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Stores tablet',
    email: 'push@example.com',
    emailVerified: true,
    role: 'stores',
    isDevice: true,
    createdAt: now,
    updatedAt: now,
  });
}

describe('pushTokens', () => {
  test('a shared device account is refused with the push app code', async ({ context }) => {
    await seedDeviceAccount(context.db);

    await expect(
      context.createCaller(mockSession(null)).pushTokens.register({ token, platform: 'ios' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', appCode: 'push.device_account' });
  });
});
