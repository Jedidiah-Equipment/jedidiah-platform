import { type Db, pushTokens, session, user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { setPushPreferences } from '../../push/push-preference-service.js';
import type { PushMessage } from '../../push/push-sender.js';
import { createTester } from '../../test/create-tester.js';
import { addBreakdownNote, reportBreakdown } from '../breakdowns/breakdown-service.js';
import { patchMachine } from '../fleet/machine-service.js';
import { addJobNote } from '../jobs/job-note-service.js';
import { createJob } from '../jobs/job-service.js';
import { captureReading } from '../readings/reading-service.js';
import { admin, adminId, foreman, foremanId, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
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
  await db.insert(session).values(
    ['wendy', 'mo', 'sam', 'bay-tablet', adminId, foremanId].map((id) => ({
      id,
      userId: id,
      token: `${id}-session`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    })),
  );
  const token = (userId: string, name: string) => ({
    userId,
    sessionId: userId,
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
      token(foremanId, 'sipho'),
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
  test('Breakdown Notes reach participants and workshop, exclude their author, and respect per-kind mutes', async ({
    context: { db, excavator },
  }) => {
    const { breakdown } = await reportBreakdown({
      db,
      actor: foreman,
      input: {
        subject: { kind: 'machine', id: excavator.id },
        urgency: 'code-red',
        description: 'Leak',
        jobId: null,
      },
    });
    await addBreakdownNote({
      db,
      actor: accessForRole('contracting-manager', 'mo'),
      input: { breakdownId: breakdown.id, text: 'Parts ordered' },
    });
    await addBreakdownNote({
      db,
      actor: accessForRole('workshop-manager', 'wendy'),
      input: { breakdownId: breakdown.id, text: 'Checking parts' },
    });
    const note = await addBreakdownNote({
      db,
      actor: foreman,
      input: { breakdownId: breakdown.id, text: 'Still leaking\nSecond line' },
    });
    const messages = await buildContractingPush({ db, event: { kind: 'breakdown-note.added', noteId: note.id } });
    expect(recipients(messages)).toEqual([
      'ExponentPushToken[mo]',
      'ExponentPushToken[wendy-1]',
      'ExponentPushToken[wendy-2]',
    ]);
    expect(messages[0]).toMatchObject({
      title: 'Note · CAT320-1',
      body: 'Sipho: Still leaking',
      channelId: 'notes',
      data: { path: `/contracting/workshop/${breakdown.id}?tab=activity` },
    });
    const reply = await addBreakdownNote({
      db,
      actor: accessForRole('workshop-manager', 'wendy'),
      input: { breakdownId: breakdown.id, text: 'On my way' },
    });
    const event = { kind: 'breakdown-note.added', noteId: reply.id } as const;
    expect(recipients(await buildContractingPush({ db, event }))).toEqual([
      'ExponentPushToken[mo]',
      'ExponentPushToken[sipho]',
    ]);
    await setPushPreferences({ db, userId: foremanId, input: { muted: ['contracting.breakdown-note'] } });
    expect(recipients(await buildContractingPush({ db, event }))).toEqual(['ExponentPushToken[mo]']);
    await db.update(user).set({ contractingRole: 'contracting-invoicing' }).where(eq(user.id, 'mo'));
    expect(await buildContractingPush({ db, event })).toEqual([]);
    await db.update(user).set({ contractingRole: 'contracting-manager' }).where(eq(user.id, 'mo'));
    await db.update(user).set({ banned: true }).where(eq(user.id, 'mo'));
    expect(await buildContractingPush({ db, event })).toEqual([]);
  });

  test('Job Notes reach the Foreman and management, add prior authors, and mute independently of Breakdown Notes', async ({
    context: { db, customer, farm, workType, excavator },
  }) => {
    const job = await createJob({
      db,
      actor: admin,
      input: {
        customerId: customer.id,
        farmId: farm.id,
        workTypeId: workType.id,
        description: null,
        foremanUserId: foremanId,
      },
    });
    const note = await addJobNote({
      db,
      actor: accessForRole('contracting-manager', 'mo'),
      input: { jobId: job.id, text: 'Start tomorrow' },
    });
    const event = { kind: 'job-note.added', noteId: note.id } as const;
    const messages = await buildContractingPush({ db, event });
    expect(recipients(messages)).toEqual([
      'ExponentPushToken[jed]',
      'ExponentPushToken[sam]',
      'ExponentPushToken[sipho]',
    ]);
    expect(messages[0]).toMatchObject({
      title: 'Note · CJOB-00001',
      body: 'mo: Start tomorrow',
      channelId: 'notes',
      data: { path: `/contracting/jobs/${job.id}?tab=activity` },
    });
    await addJobNote({
      db,
      actor: accessForRole('workshop-manager', 'wendy'),
      input: { jobId: job.id, text: 'Machine ready' },
    });
    await setPushPreferences({ db, userId: foremanId, input: { muted: ['contracting.job-note'] } });
    expect(recipients(await buildContractingPush({ db, event }))).toEqual([
      'ExponentPushToken[jed]',
      'ExponentPushToken[sam]',
      'ExponentPushToken[wendy-1]',
      'ExponentPushToken[wendy-2]',
    ]);
    await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    // The Job's Foreman participates even when someone else reported its Breakdown.
    const { breakdown } = await reportBreakdown({
      db,
      actor: admin,
      input: {
        subject: { kind: 'machine', id: excavator.id },
        urgency: 'code-red',
        description: 'Leak',
        jobId: job.id,
      },
    });
    const reply = await addBreakdownNote({
      db,
      actor: accessForRole('workshop-manager', 'wendy'),
      input: { breakdownId: breakdown.id, text: 'Checking' },
    });
    expect(
      recipients(await buildContractingPush({ db, event: { kind: 'breakdown-note.added', noteId: reply.id } })),
    ).toEqual(['ExponentPushToken[jed]', 'ExponentPushToken[sipho]']);
  });

  test.for(['breakdown-note.added', 'job-note.added'] as const)(
    'a missing note sends nothing for %s',
    async (kind, { context: { db } }) => {
      expect(
        await buildContractingPush({ db, event: { kind, noteId: '00000000-0000-4000-8000-000000000001' } }),
      ).toEqual([]);
    },
  );

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

  test('a workshop manager who muted Code Green still gets Code Red', async ({ context: { db, excavator } }) => {
    await setPushPreferences({ db, userId: 'wendy', input: { muted: ['contracting.breakdown.code-green'] } });

    expect(await report(db, excavator.id, 'code-green')).toEqual([]);
    expect(recipients(await report(db, excavator.id, 'code-red'))).toContain('ExponentPushToken[wendy-1]');
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

    expect(delivery).toEqual({ sent: 2, pruned: 0, failed: 0, failures: {} });
    expect(sent[0]).toMatchObject({ title: 'Service due soon · CAT320-1', body: '51.0 h to next service.' });

    // A service closed before the queue ran moved the due point on: there is nothing left to say.
    await patchMachine({ db, actorUserId: adminId, input: { id: excavator.id, nextServiceDueHours: 2000 } });
    expect(
      await buildContractingPush({ db, event: { kind: 'machine.service-due-soon', machineId: excavator.id } }),
    ).toEqual([]);
  });
});
