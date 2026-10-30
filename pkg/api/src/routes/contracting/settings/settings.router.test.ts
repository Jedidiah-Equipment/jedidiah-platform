import { user } from '@pkg/db';
import type { ContractingRole } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Settings admin',
    email: 'settings-admin@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { db };
});

function contractingSession(role: ContractingRole) {
  const session = mockSession(null);
  session.user.contractingRole = role;
  return session;
}

const input = {
  travelFlagThresholdHours: 3.5,
  johnDeereDifferenceThresholdHours: 12,
  serviceDueSoonThresholdHours: 120,
  utilisationTargetPercent: 65,
};

test('allows only contracting-admin and super-admin to read and save Contracting Settings', async ({ context }) => {
  const forbidden = [
    mockSession('admin'),
    ...(
      ['contracting-manager', 'workshop-manager', 'foreman', 'contracting-invoicing', 'driver', 'mechanic'] as const
    ).map(contractingSession),
  ];
  for (const session of forbidden) {
    const settings = context.createCaller(session).contractingSettings;
    await expect(settings.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(settings.update(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
  await expect(context.createAnonCaller().contractingSettings.get()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

  for (const [index, session] of [contractingSession('contracting-admin'), mockSession('super-admin')].entries()) {
    const settings = context.createCaller(session).contractingSettings;
    const saved = await settings.update({ ...input, utilisationTargetPercent: index ? null : 65 });
    expect(saved).toMatchObject({ ...input, utilisationTargetPercent: index ? null : 65 });
    expect(await settings.get()).toEqual(saved);
  }
});
