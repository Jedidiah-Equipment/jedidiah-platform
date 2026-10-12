import { type Db, pushTokens, user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole } from '@pkg/schema';
import { describe, expect } from 'vitest';
import type { PushMessage } from '../../push/push-sender.js';
import { createTester } from '../../test/create-tester.js';
import { reportBreakdown } from '../breakdowns/breakdown-service.js';
import { patchMachine } from '../fleet/machine-service.js';
import { captureReading } from '../readings/reading-service.js';
import { admin, adminId, seedJobFixtures } from '../test/job-fixtures.js';
import { buildContractingPush, dispatchContractingPush } from './contracting-push.js';

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const now = new Date();
  const person = (
    id: string,
    roles: { contractingRole?: ContractingRole; role?: 'super-admin' },
    extra: { isDevice?: boolean } = {},
  ) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    ...roles,
    ...extra,
  });
  await db
    .insert(user)
    .values([
      person('wendy', { contractingRole: 'workshop-manager' }),
      person('mo', { contractingRole: 'contracting-manager' }),
      person('sam', { role: 'super-admin' }),
      person('bay-tablet', { contractingRole: 'workshop-manager' }, { isDevice: true }),
      person('quiet', { contractingRole: 'workshop-manager' }),
    ]);
  const token = (userId: string, name: string) => ({
    userId,
    token: `ExponentPushToken[${name}]`,
    platform: 'android' as const,
  });
  // The tablet's row predates the rule that device accounts never register; it must still never be pinged.
  await db
    .insert(pushTokens)
    .values([
      token('wendy', 'wendy-1'),
      token('wendy', 'wendy-2'),
      token('mo', 'mo'),
      token('sam', 'sam'),
      token(adminId, 'jed'),
      token('bay-tablet', 'tablet'),
    ]);
  return fixtures;
});

const recipients = (messages: readonly PushMessage[]) => messages.map((message) => message.to).sort();

async function report(db: Db, machineId: string, urgency: 'code-red' | 'code-green', reporter = admin) {
  const { breakdown } = await reportBreakdown({
    db,
    actor: reporter,
    input: { subject: { kind: 'machine', id: machineId }, urgency, description: 'Hydraulic leak', jobId: null },
  });
  return buildContractingPush({ db, event: { kind: 'breakdown.reported', breakdownId: breakdown.id } });
}

describe('Contracting push fan-out', () => {
  test('Code Green reaches every workshop manager install and nobody else', async ({ context: { db, excavator } }) => {
    const messages = await report(db, excavator.id, 'code-green');

    expect(recipients(messages)).toEqual(['ExponentPushToken[wendy-1]', 'ExponentPushToken[wendy-2]']);
    expect(messages[0]).toMatchObject({ title: 'Code Green · CAT320-1', body: 'Hydraulic leak. Reported by Jed.' });
  });

  test('Code Red also reaches management and super-admins, but never the reporter', async ({
    context: { db, excavator },
  }) => {
    const messages = await report(db, excavator.id, 'code-red', accessForRole('workshop-manager', 'wendy'));

    expect(recipients(messages)).toEqual(['ExponentPushToken[jed]', 'ExponentPushToken[mo]', 'ExponentPushToken[sam]']);
  });

  test('Service Due Soon reaches the workshop managers with the hours left', async ({ context: { db, excavator } }) => {
    await patchMachine({ db, actorUserId: adminId, input: { id: excavator.id, nextServiceDueHours: 1500 } });
    await captureReading({
      db,
      actor: admin,
      input: {
        machineId: excavator.id,
        role: 'spot',
        value: 1449,
        capturedAt: '2026-09-07T08:00:00Z',
        disputePrevious: false,
      },
    });
    const sent: PushMessage[] = [];

    const delivery = await dispatchContractingPush({
      db,
      event: { kind: 'machine.service-due-soon', machineId: excavator.id },
      sender: async (messages) => {
        sent.push(...messages);
        return messages.map((message) => ({ to: message.to, ok: true as const }));
      },
    });

    expect(delivery).toEqual({ sent: 2, pruned: 0, failed: 0 });
    expect(sent[0]).toMatchObject({ title: 'Service due soon · CAT320-1', body: '51.0 h to next service.' });
  });
});
