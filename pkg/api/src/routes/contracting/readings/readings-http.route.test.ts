import {
  createAssignment,
  createCategory,
  createCustomer,
  createFarm,
  createJob,
  createMachine,
  createWorkType,
  getJob,
  listReadingsByMachine,
  patchMachine,
  recordTelematicsReading,
} from '@pkg/core/contracting';
import { user } from '@pkg/db';
import { contractingJohnDeereLinks } from '@pkg/db/contracting';
import type { ContractingPushEvent } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { MachineCreateInput } from '@pkg/schema/contracting';
import Fastify from 'fastify';
import { expect, vi } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { registerReadingHttpRoutes } from './readings-http.route.js';

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('../../../auth/session.js', async (original) => ({
  ...(await original<typeof import('../../../auth/session.js')>()),
  getSessionFromHeaders: async () => state.session,
}));
const test = createTester(async ({ db, auth }) => {
  const actorUserId = 'test-user-id';
  const actor = accessForRole('foreman', actorUserId);
  await db.insert(user).values({
    id: actorUserId,
    name: 'Test',
    email: 'reading-http@example.com',
    emailVerified: true,
    contractingRole: 'foreman',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const category = await createCategory({ db, actorUserId, input: { name: 'Tractors', kind: 'machine' } });
  const machine = await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({ code: 'T1', make: 'Deere', model: '6140', categoryId: category.id }),
  });
  const customer = await createCustomer({ db, actorUserId, input: { name: 'Rowley' } });
  const farm = await createFarm({ db, actorUserId, input: { customerId: customer.id, name: 'Rooikraal' } });
  const workType = await createWorkType({ db, actorUserId, input: { name: 'Dam building' } });
  const job = await createJob({
    db,
    // Management sets the Job up; the Foreman only captures on it.
    actor: accessForRole('contracting-manager', actorUserId),
    input: {
      customerId: customer.id,
      farmId: farm.id,
      workTypeId: workType.id,
      description: null,
      foremanUserId: actorUserId,
    },
  });
  await createAssignment({
    db,
    actor,
    input: { jobId: job.id, machineId: machine.id, implementId: null },
  });
  const [assignment] = (await getJob({ db, id: job.id })).assignments;
  if (!assignment) throw new Error('Expected Machine Assignment');
  const app = Fastify();
  app.decorate('auth', auth);
  const pushes: ContractingPushEvent[] = [];
  await registerReadingHttpRoutes(app, { db, push: { schedule: (event) => pushes.push(event) } });
  state.session = mockSession(null);
  (state.session as ReturnType<typeof mockSession>).user.contractingRole = 'foreman';
  return { assignmentId: assignment.id, db, app, jobId: job.id, machineId: machine.id, pushes };
});
function capture(machineId: string, fields: Record<string, unknown> = {}) {
  return {
    method: 'POST' as const,
    url: '/api/contracting/readings',
    payload: { machineId, role: 'spot', value: 123.4, capturedAt: '2026-09-07T08:00:00Z', ...fields },
  };
}
test('rejects unauthenticated and Equipment-only captures before parsing their body', async ({ context }) => {
  try {
    state.session = null;
    const signedOut = await context.app.inject(capture(context.machineId));
    expect(signedOut.statusCode).toBe(401);
    expect(signedOut.json()).toEqual({
      data: { appCode: 'auth.unauthenticated' },
      message: 'Please sign in to continue.',
    });
    state.session = mockSession('admin');
    expect((await context.app.inject(capture(context.machineId))).statusCode).toBe(403);
  } finally {
    await context.app.close();
  }
});

test('a refusal John Deere brackets carries the Read At it proposes beside the appCode', async ({ context }) => {
  const { app, db, machineId } = context;
  try {
    const [link] = await db
      .insert(contractingJohnDeereLinks)
      .values({
        machineId,
        equipmentId: 'eq-1',
        principalId: 1,
        organizationId: '4321',
        deereName: 'Deere 1',
        linkedByUserId: 'test-user-id',
        linkedAt: new Date('2026-09-01T00:00:00Z'),
      })
      .returning();
    if (!link) throw new Error('link insert returned no row');
    for (const [hours, reportTime] of [
      [120, '2026-09-07T05:00:00Z'],
      [125, '2026-09-07T06:00:00Z'],
    ] as const)
      await recordTelematicsReading({
        db,
        machineId,
        linkId: link.id,
        provider: 'john-deere',
        hours,
        reportTime: new Date(reportTime),
        now: new Date('2026-09-08T00:00:00Z'),
      });
    const refused = await app.inject(capture(machineId, { value: 122.5 }));
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({
      data: {
        appCode: 'reading.below_latest',
        suggestedReadAt: {
          readAt: '2026-09-07T05:30:00.000Z',
          floor: { value: 120, capturedAt: '2026-09-07T05:00:00.000Z', telematicsProvider: 'john-deere' },
          ceiling: { value: 125, capturedAt: '2026-09-07T06:00:00.000Z', telematicsProvider: 'john-deere' },
        },
      },
      message: expect.stringContaining('John Deere reported'),
    });
  } finally {
    await app.close();
  }
});

test('reserves a Baseline Reading for Contracting administrators', async ({ context }) => {
  const { app, machineId } = context;
  try {
    const refused = await app.inject(capture(machineId, { role: 'baseline' }));
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ data: { appCode: 'reading.forbidden' } });
    (state.session as ReturnType<typeof mockSession>).user.contractingRole = 'contracting-admin';
    const accepted = await app.inject(capture(machineId, { role: 'baseline' }));
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({ role: 'baseline', method: 'manual' });
    const second = await app.inject(capture(machineId, { role: 'baseline' }));
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ data: { appCode: 'reading.baseline_exists' } });
  } finally {
    await app.close();
  }
});

test('accepts every phone field and retries a capture without duplicating it', async ({ context }) => {
  const { app, db, machineId } = context;
  try {
    const localId = '78108c3d-4b34-44f1-bf87-4fcb00a6a233';
    const request = capture(machineId, { localId, expectedPreviousId: null, disputePrevious: false, comment: null });
    const first = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ id: localId, method: 'manual' });
    expect((await app.inject(request)).json().id).toBe(localId);
    expect(await listReadingsByMachine({ db, machineId })).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('schedules Service Due Soon for the capture that crosses into the window, once', async ({ context }) => {
  const { app, db, machineId, pushes } = context;
  try {
    await patchMachine({ db, actorUserId: 'test-user-id', input: { id: machineId, nextServiceDueHours: 200 } });
    const crossing = capture(machineId, { localId: '5f0d7a8e-12c4-4c55-9a43-6a2b8d1e7f10' });
    expect((await app.inject(crossing)).statusCode).toBe(201);
    expect((await app.inject(crossing)).statusCode).toBe(201);
    expect((await app.inject(capture(machineId, { value: 130, capturedAt: '2026-09-08T08:00:00Z' }))).statusCode).toBe(
      201,
    );
    expect(pushes).toEqual([{ kind: 'machine.service-due-soon', machineId }]);
  } finally {
    await app.close();
  }
});

test("crosses into the window at the Machine's own Service Alert Hours, not the threshold in Settings", async ({
  context,
}) => {
  const { app, db, machineId, pushes } = context;
  try {
    await patchMachine({
      db,
      actorUserId: 'test-user-id',
      input: { id: machineId, nextServiceDueHours: 200, serviceAlertHours: 50 },
    });
    expect((await app.inject(capture(machineId, { value: 123.4 }))).statusCode).toBe(201);
    expect(pushes).toEqual([]);
    expect((await app.inject(capture(machineId, { value: 160, capturedAt: '2026-09-09T08:00:00Z' }))).statusCode).toBe(
      201,
    );
    expect(pushes).toEqual([{ kind: 'machine.service-due-soon', machineId }]);
  } finally {
    await app.close();
  }
});

test('management captures a backdated spot reading on the Machine alone, as the web Machine page posts it', async ({
  context,
}) => {
  const { app, machineId } = context;
  try {
    (state.session as ReturnType<typeof mockSession>).user.contractingRole = 'contracting-manager';
    const response = await app.inject(capture(machineId, { capturedAt: '2026-09-07T06:30:00.000Z' }));
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      role: 'spot',
      value: 123.4,
      capturedAt: '2026-09-07T06:30:00.000Z',
    });
  } finally {
    await app.close();
  }
});

test('stores a trimmed capture comment', async ({ context }) => {
  const { app, machineId } = context;
  try {
    const commented = await app.inject(capture(machineId, { comment: '  Glass cracked, digits hard to read  ' }));
    expect(commented.statusCode).toBe(201);
    expect(commented.json().comment).toBe('Glass cracked, digits hard to read');
  } finally {
    await app.close();
  }
});

test('takes an arrival on its Machine Assignment and activates its Job', async ({ context }) => {
  try {
    const response = await context.app.inject(
      capture(context.machineId, {
        role: 'arrival',
        assignmentId: context.assignmentId,
      }),
    );
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ role: 'arrival', machineId: context.machineId });
    expect(await getJob({ db: context.db, id: context.jobId })).toMatchObject({ status: 'active' });
  } finally {
    await context.app.close();
  }
});

test('refuses invalid Hour Reading fields without a row', async ({ context }) => {
  const { app, db, machineId } = context;
  try {
    for (const fields of [{ role: 'arrival' }, { value: undefined }, { photo: 'meter.jpg' }]) {
      const response = await app.inject(capture(machineId, fields));
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: 'Invalid Hour Reading.' });
    }
    expect(await listReadingsByMachine({ db, machineId })).toEqual([]);
  } finally {
    await app.close();
  }
});
