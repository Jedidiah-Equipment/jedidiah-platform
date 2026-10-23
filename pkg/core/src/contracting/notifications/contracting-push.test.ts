import { type Db, pushTokens, session, user } from '@pkg/db';
import { noteAdded, noteThreads } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole, UserAccessSummary } from '@pkg/schema';
import { noteThreadKinds } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { setPushPreferences } from '../../push/push-preference-service.js';
import type { PushMessage } from '../../push/push-sender.js';
import { createTester } from '../../test/create-tester.js';
import { reportBreakdown } from '../breakdowns/breakdown-service.js';
import { patchMachine } from '../fleet/machine-service.js';
import { cancelJob, createJob, patchJob } from '../jobs/job-service.js';
import { addNote } from '../notes/note-service.js';
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

type Fixtures = Awaited<ReturnType<typeof seedJobFixtures>> & { db: Db };

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
  // Sipho takes part in each record; the outsider reads it but is neither always reached nor a participant.
  const threads = {
    job: {
      open: async ({ db, customer, farm, workType }: Fixtures) => {
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
        return job.id;
      },
      input: (id: string, text: string) => ({ id, text }),
      title: 'Note · CJOB-00001',
      path: (id: string) => `/contracting/jobs/${id}?tab=activity`,
      alwaysReached: ['jed', 'mo', 'sam'],
      replier: { actor: accessForRole('contracting-manager', 'mo'), othersReached: ['jed', 'sam'] },
      outsider: { id: 'wendy', role: 'workshop-manager', tokens: ['wendy-1', 'wendy-2'] },
    },
    breakdown: {
      open: async ({ db, excavator }: Fixtures) => {
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
        return breakdown.id;
      },
      input: (id: string, text: string) => ({ id, text }),
      title: 'Note · CAT320-1',
      path: (id: string) => `/contracting/workshop/${id}?tab=activity`,
      alwaysReached: ['wendy-1', 'wendy-2'],
      replier: { actor: accessForRole('workshop-manager', 'wendy'), othersReached: [] },
      outsider: { id: 'mo', role: 'contracting-manager', tokens: ['mo'] },
    },
  } as const;
  const token = (name: string) => `ExponentPushToken[${name}]`;
  const tokens = (...names: readonly (readonly string[])[]) => names.flat().map(token).sort();

  test.for(noteThreadKinds)(
    '%s Notes reach the always-reached roles, participants and prior authors, never their author, and mute per kind',
    async (kind, { context }) => {
      const { db } = context;
      const thread = threads[kind];
      const id = await thread.open(context);
      const add = (actor: UserAccessSummary, text: string) =>
        addNote({ db, actor, thread: kind, input: thread.input(id, text) });
      const { outsider } = thread;
      await add(accessForRole(outsider.role, outsider.id), 'Parts ordered');
      const note = await add(foreman, 'Still leaking\nSecond line');

      const messages = await buildContractingPush({ db, event: noteAdded(kind, note.id) });
      expect(recipients(messages)).toEqual(tokens(thread.alwaysReached, outsider.tokens));
      expect(messages[0]).toMatchObject({
        title: thread.title,
        body: 'Sipho: Still leaking',
        channelId: 'notes',
        data: { path: thread.path(id) },
      });

      const reply = await add(thread.replier.actor, 'On my way');
      const event = noteAdded(kind, reply.id);
      expect(recipients(await buildContractingPush({ db, event }))).toEqual(
        tokens(thread.replier.othersReached, outsider.tokens, ['sipho']),
      );
      const otherKind = noteThreadKinds.find((other) => other !== kind) ?? kind;
      await setPushPreferences({ db, userId: foremanId, input: { muted: [noteThreads[otherKind].pushKind] } });
      expect(recipients(await buildContractingPush({ db, event }))).toContain(token('sipho'));
      await setPushPreferences({ db, userId: foremanId, input: { muted: [noteThreads[kind].pushKind] } });
      expect(recipients(await buildContractingPush({ db, event }))).not.toContain(token('sipho'));

      // A prior author reached only by having noted drops out once they cannot read the record, or are banned.
      const outsiderReached = async () =>
        recipients(await buildContractingPush({ db, event })).includes(token(outsider.tokens[0]));
      await db.update(user).set({ contractingRole: 'contracting-invoicing' }).where(eq(user.id, outsider.id));
      expect(await outsiderReached()).toBe(false);
      await db.update(user).set({ contractingRole: outsider.role }).where(eq(user.id, outsider.id));
      expect(await outsiderReached()).toBe(true);
      await db.update(user).set({ banned: true }).where(eq(user.id, outsider.id));
      expect(await outsiderReached()).toBe(false);
    },
  );

  test('a Breakdown Note reaches the Foreman of its Job even when someone else reported it', async ({
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
    await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
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
    const reply = await addNote({
      db,
      actor: accessForRole('workshop-manager', 'wendy'),
      thread: 'breakdown',
      input: { id: breakdown.id, text: 'Checking' },
    });
    expect(recipients(await buildContractingPush({ db, event: noteAdded('breakdown', reply.id) }))).toEqual([
      'ExponentPushToken[jed]',
      'ExponentPushToken[sipho]',
    ]);
  });

  test('prior Foremen lose note alerts after reassignment, and Job alerts stop outside readable statuses', async ({
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
    await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
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
    await addNote({ db, actor: foreman, thread: 'job', input: { id: job.id, text: 'Gate code' } });
    await addNote({ db, actor: foreman, thread: 'breakdown', input: { id: breakdown.id, text: 'Checking' } });
    const jobNote = await addNote({
      db,
      actor: admin,
      thread: 'job',
      input: { id: job.id, text: 'Management update' },
    });
    const breakdownNote = await addNote({
      db,
      actor: admin,
      thread: 'breakdown',
      input: { id: breakdown.id, text: 'Workshop update' },
    });
    const jobEvent = noteAdded('job', jobNote.id);
    const breakdownEvent = noteAdded('breakdown', breakdownNote.id);
    for (const event of [jobEvent, breakdownEvent])
      expect(recipients(await buildContractingPush({ db, event }))).toContain('ExponentPushToken[sipho]');
    await patchJob({ db, actor: admin, input: { id: job.id, foremanUserId: null } });
    for (const event of [jobEvent, breakdownEvent])
      expect(recipients(await buildContractingPush({ db, event }))).not.toContain('ExponentPushToken[sipho]');
    await patchJob({ db, actor: admin, input: { id: job.id, foremanUserId: foremanId } });
    await cancelJob({ db, actor: admin, input: { id: job.id, reason: 'Cancelled by customer' } });
    expect(recipients(await buildContractingPush({ db, event: jobEvent }))).not.toContain('ExponentPushToken[sipho]');
    // The linked Breakdown still belongs to its Foreman even when the Job closes.
    expect(recipients(await buildContractingPush({ db, event: breakdownEvent }))).toContain('ExponentPushToken[sipho]');
  });

  test.for(noteThreadKinds)('a missing %s note sends nothing', async (kind, { context: { db } }) => {
    expect(await buildContractingPush({ db, event: noteAdded(kind, '00000000-0000-4000-8000-000000000001') })).toEqual(
      [],
    );
  });

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

  test('Service Due Soon reaches the workshop managers and management with the hours left', async ({
    context: { db, excavator },
  }) => {
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

    expect(delivery).toEqual({ sent: 5, pruned: 0, failed: 0, failures: {} });
    // The capturer is not excluded: the contracting-admin who read the meter is told too.
    expect(recipients(sent)).toEqual([
      'ExponentPushToken[jed]',
      'ExponentPushToken[mo]',
      'ExponentPushToken[sam]',
      'ExponentPushToken[wendy-1]',
      'ExponentPushToken[wendy-2]',
    ]);
    expect(sent[0]).toMatchObject({ title: 'Service due soon · CAT320-1', body: '51.0 h to next service.' });

    // A service closed before the queue ran moved the due point on: there is nothing left to say.
    await patchMachine({ db, actorUserId: adminId, input: { id: excavator.id, nextServiceDueHours: 2000 } });
    expect(
      await buildContractingPush({ db, event: { kind: 'machine.service-due-soon', machineId: excavator.id } }),
    ).toEqual([]);
  });
});
