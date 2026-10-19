import {
  createCategory,
  createCustomer,
  createFarm,
  createJob,
  createMachine,
  createWorkType,
  reportBreakdown,
} from '@pkg/core/contracting';
import { eq, user } from '@pkg/db';
import type { ContractingPushEvent } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { type ContractingRole, DateIso } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { getTRPCAppCode } from '@/trpc/errors.js';

function sessionAs(id: string, role: ContractingRole) {
  const session = mockSession(null);
  session.user.id = id;
  session.session.userId = id;
  session.user.contractingRole = role;
  return session;
}

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values(
    (
      [
        ['sipho', 'foreman'],
        ['connor', 'workshop-manager'],
        ['karen', 'contracting-invoicing'],
        ['jed', 'contracting-admin'],
      ] as const
    ).map(([id, contractingRole]) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      contractingRole,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const admin = accessForRole('contracting-admin', 'jed');
  const customer = await createCustomer({ db, actorUserId: 'jed', input: { name: 'Rowley' } });
  const farm = await createFarm({ db, actorUserId: 'jed', input: { customerId: customer.id, name: 'Rooikraal' } });
  const workType = await createWorkType({ db, actorUserId: 'jed', input: { name: 'Dam building' } });
  const job = await createJob({
    db,
    actor: admin,
    input: {
      customerId: customer.id,
      farmId: farm.id,
      workTypeId: workType.id,
      description: null,
      foremanUserId: 'sipho',
    },
  });
  return { db, jobId: job.id };
});

test('a Job Note lands in the Activity of everyone who reaches its Job, and invoicing has no Activity', async ({
  context,
}) => {
  const sipho = context.createCaller(sessionAs('sipho', 'foreman'));
  const note = await sipho.contractingNotes.add({ thread: 'job', id: context.jobId, text: 'Gate code is 4471' });
  expect(note).toMatchObject({ authorName: 'sipho', text: 'Gate code is 4471' });

  for (const [id, role] of [
    ['sipho', 'foreman'],
    ['connor', 'workshop-manager'],
  ] as const) {
    // The phone's infinite query sends tRPC's `direction` beside the list's own fields.
    const feed = await context
      .createCaller(sessionAs(id, role))
      .contractingActivity.list({ jobId: context.jobId, direction: 'forward' } as never);
    expect(feed, role).toMatchObject({ items: [{ type: 'job-note', id: note.id }], nextCursor: null });
  }

  const karen = context.createCaller(sessionAs('karen', 'contracting-invoicing'));
  const refusal = await karen.contractingActivity.list({}).catch((error: unknown) => error);
  expect(refusal).toMatchObject({ code: 'FORBIDDEN' });
  expect(getTRPCAppCode(refusal as never)).toBe('auth.forbidden');
  await expect(karen.contractingNotes.add({ thread: 'job', id: context.jobId, text: 'Paid?' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
});

test('marking Contracting Activity seen leaves the Equipment mark alone', async ({ context }) => {
  const equipmentSeen = DateIso.parse('2026-08-18T08:00:00.000Z');
  await context.db
    .update(user)
    .set({ lastActivitySeen: { equipment: equipmentSeen } })
    .where(eq(user.id, 'sipho'));
  const sipho = context.createCaller(sessionAs('sipho', 'foreman'));
  const note = await sipho.contractingNotes.add({ thread: 'job', id: context.jobId, text: 'Diesel bowser is empty' });

  // Acknowledging a future instant clamps to the newest item the feed holds.
  const seen = await sipho.contractingActivity.setLastSeen({ seenAt: DateIso.parse('2099-01-01T00:00:00.000Z') });
  expect(seen).toBe(note.createdAt);
  await expect(sipho.contractingActivity.getLastSeen()).resolves.toBe(note.createdAt);

  const [account] = await context.db.select({ map: user.lastActivitySeen }).from(user).where(eq(user.id, 'sipho'));
  expect(account?.map).toEqual({ equipment: equipmentSeen, contracting: note.createdAt });
});

test('note mutations schedule their committed notes and rejected notes schedule nothing', async ({ context }) => {
  const events: ContractingPushEvent[] = [];
  const contracting = { push: { schedule: (event: ContractingPushEvent) => events.push(event) } };
  const sipho = context.createCaller(sessionAs('sipho', 'foreman'), { contracting });
  const note = await sipho.contractingNotes.add({ thread: 'job', id: context.jobId, text: 'Gate is locked' });
  expect(events).toEqual([{ kind: 'note.added', thread: 'job', noteId: note.id }]);
  const category = await createCategory({
    db: context.db,
    actorUserId: 'jed',
    input: { name: 'Tractors', kind: 'machine' },
  });
  const machine = await createMachine({
    db: context.db,
    actorUserId: 'jed',
    input: {
      code: 'JD6140M-2',
      make: 'John Deere',
      model: '6140M',
      categoryId: category.id,
      year: null,
      registration: null,
      currentDriverUserId: null,
      notes: null,
      serviceIntervalHours: null,
      nextServiceDueHours: null,
    },
  });
  const { breakdown } = await reportBreakdown({
    db: context.db,
    actor: accessForRole('foreman', 'sipho'),
    input: {
      subject: { kind: 'machine', id: machine.id },
      urgency: 'code-red',
      description: 'Leak',
      jobId: null,
    },
  });
  const reply = await sipho.contractingNotes.add({ thread: 'breakdown', id: breakdown.id, text: 'Still leaking' });
  // The per-kind procedures delegate to the same call until the next mobile release.
  const viaJob = await sipho.contractingJobs.notes.add({ jobId: context.jobId, text: 'Gate is open' });
  const viaBreakdown = await sipho.contractingBreakdowns.notes.add({ breakdownId: breakdown.id, text: 'Fixed' });
  expect(events).toEqual([
    { kind: 'note.added', thread: 'job', noteId: note.id },
    { kind: 'note.added', thread: 'breakdown', noteId: reply.id },
    { kind: 'note.added', thread: 'job', noteId: viaJob.id },
    { kind: 'note.added', thread: 'breakdown', noteId: viaBreakdown.id },
  ]);
  events.length = 0;
  const karen = context.createCaller(sessionAs('karen', 'contracting-invoicing'), { contracting });
  await expect(karen.contractingNotes.add({ thread: 'job', id: context.jobId, text: 'Refused' })).rejects.toMatchObject(
    { code: 'FORBIDDEN' },
  );
  await expect(
    karen.contractingNotes.add({ thread: 'breakdown', id: breakdown.id, text: 'Refused' }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(events).toEqual([]);
});
