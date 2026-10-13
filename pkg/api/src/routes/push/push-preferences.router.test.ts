import { user } from '@pkg/db';
import type { ContractingRole } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

function sessionAs(id: string, role: ContractingRole) {
  const session = mockSession(null);
  session.user.id = id;
  session.session.userId = id;
  session.user.contractingRole = role;
  return session;
}

const test = createTester(async ({ db }) => {
  const now = new Date();
  const person = (id: string, contractingRole: ContractingRole, isDevice = false) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    isDevice,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([
      person('connor', 'workshop-manager'),
      person('jed', 'contracting-admin'),
      person('bay-tablet', 'workshop-manager', true),
    ]);
  return { db };
});

describe('pushPreferences', () => {
  test('a mute is kept, read back, and shows in the Contracting Audit Log as a user event', async ({ context }) => {
    const connor = context.createCaller(sessionAs('connor', 'workshop-manager'));
    await expect(connor.pushPreferences.get()).resolves.toEqual({ muted: [] });

    await expect(
      connor.pushPreferences.set({
        muted: ['contracting.service-due-soon', 'contracting.breakdown.code-green', 'contracting.service-due-soon'],
      }),
    ).resolves.toEqual({ muted: ['contracting.breakdown.code-green', 'contracting.service-due-soon'] });
    await expect(connor.pushPreferences.get()).resolves.toEqual({
      muted: ['contracting.breakdown.code-green', 'contracting.service-due-soon'],
    });

    const log = await context
      .createCaller(sessionAs('jed', 'contracting-admin'))
      .audit.list({ business: 'contracting', filters: { entityIds: ['connor'] } });
    expect(log.items).toEqual([
      expect.objectContaining({
        entityType: 'user',
        entityId: 'connor',
        changes: {
          mutedPushKinds: {
            from: [],
            to: ['contracting.breakdown.code-green', 'contracting.service-due-soon'],
          },
        },
      }),
    ]);
  });

  test('a kind no longer in the registry reads as unmuted', async ({ context }) => {
    await context.db.update(user).set({ mutedPushKinds: ['contracting.retired', 'contracting.breakdown.code-red'] });

    await expect(context.createCaller(sessionAs('connor', 'workshop-manager')).pushPreferences.get()).resolves.toEqual({
      muted: ['contracting.breakdown.code-red'],
    });
  });

  test('a shared device account is refused with the push app code', async ({ context }) => {
    const tablet = context.createCaller(sessionAs('bay-tablet', 'workshop-manager'));

    await expect(tablet.pushPreferences.get()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      appCode: 'push.device_account',
    });
    await expect(tablet.pushPreferences.set({ muted: [] })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      appCode: 'push.device_account',
    });
  });
});
