import { randomUUID } from 'node:crypto';
import {
  captureReading,
  completeJob,
  createAssignment,
  createCategory,
  createCustomer,
  createFarm,
  createJob,
  createMachine,
  createMeasureType,
  createRate,
  createWorkType,
  getJob,
  isReadingError,
  markPriced,
  setStintRate,
} from '@pkg/core/contracting';
import { type Db, user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole } from '@pkg/schema';
import { DateOnlyIso } from '@pkg/schema';
import type { JobActionName, JobActionVerdict, JobStatus } from '@pkg/schema/contracting';
import { TRPCError } from '@trpc/server';
import { describe, expect } from 'vitest';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { getTRPCPublicMetadata } from '@/trpc/errors.js';

/** Every caller signs in as this person; the Jobs name them as Foreman, so a Foreman caller works their own. */
const callerId = 'test-user-id';
const setupId = 'actions-setup-admin';
const setup = accessForRole('contracting-admin', setupId);

let sequence = 0;

const test = createTester(async ({ db }) => {
  const now = new Date();
  const person = (id: string, contractingRole: ContractingRole) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(user).values([person(callerId, 'foreman'), person(setupId, 'contracting-admin')]);
  const customer = await createCustomer({ db, actorUserId: setupId, input: { name: 'Rowley' } });
  const farm = await createFarm({ db, actorUserId: setupId, input: { customerId: customer.id, name: 'Rooikraal' } });
  const workType = await createWorkType({ db, actorUserId: setupId, input: { name: 'Dam building' } });
  const category = await createCategory({ db, actorUserId: setupId, input: { name: 'Excavators', kind: 'machine' } });
  const loads = await createMeasureType({ db, actorUserId: setupId, input: { name: 'Loads' } });
  const rate = await createRate({
    db,
    actorUserId: setupId,
    input: { name: 'Dry hire', basis: 'time', measureTypeId: null, amount: 600 },
  });
  const machine = () =>
    createMachine({
      db,
      actorUserId: setupId,
      input: {
        code: `EX-${++sequence}`,
        make: 'CAT',
        model: '320',
        categoryId: category.id,
        year: null,
        registration: null,
        currentDriverUserId: null,
        notes: null,
        serviceIntervalHours: null,
        nextServiceDueHours: null,
      },
    });

  /** A fresh Job in the given status, with one stint on its own Machine and a spare Machine to add. */
  async function jobAt(status: JobStatus) {
    const [worked, spare] = [await machine(), await machine()];
    const job = await createJob({
      db,
      actor: setup,
      input: {
        customerId: customer.id,
        farmId: farm.id,
        workTypeId: workType.id,
        description: null,
        foremanUserId: callerId,
      },
    });
    const stint = await createAssignment({
      db,
      actor: setup,
      input: { jobId: job.id, machineId: worked.id, implementId: null },
    });
    const capture = (role: 'arrival' | 'departure', value: number) =>
      captureReading({
        db,
        actor: setup,
        input: {
          machineId: worked.id,
          assignmentId: stint.id,
          role,
          value,
          capturedAt: new Date(Date.parse('2026-09-01T06:00:00Z') + ++sequence * 3_600_000).toISOString(),
          disputePrevious: false,
          ...(role === 'departure' ? { comment: 'Photo unavailable' } : {}),
        },
      });
    const fixture = { job, stint, spare, arrivalReadingId: null as string | null };
    if (status === 'upcoming') return fixture;
    fixture.arrivalReadingId = (await capture('arrival', 100)).id;
    if (status === 'active') return fixture;
    await capture('departure', 110);
    await completeJob({
      db,
      actor: setup,
      input: {
        id: job.id,
        startDate: DateOnlyIso.parse('2026-09-01'),
        endDate: DateOnlyIso.parse('2026-09-02'),
        dieselLitres: 0,
        notes: null,
        removePlannedAssignmentIds: [],
      },
    });
    if (status === 'completed') return fixture;
    await setStintRate({ db, actor: setup, input: { assignmentId: stint.id, rateId: rate.id } });
    const total = (await getJob({ db, id: job.id })).pricing?.total ?? 0;
    await markPriced({ db, actor: setup, input: { id: job.id, expectedTotal: total } });
    return fixture;
  }

  return { db, jobAt, loadsId: loads.id };
});

type Fixture = { job: { id: string }; stint: { id: string }; spare: { id: string }; arrivalReadingId: string | null };
type Seeded = { db: Db; loadsId: string };

/** One write per Job Action, as a surface asks for it; null where the fixture has nothing to act on. */
const attempts: Record<
  JobActionName,
  (caller: AppRouterCaller, fixture: Fixture, seeded: Seeded, role: ContractingRole) => Promise<unknown> | null
> = {
  editSetup: (caller, { job }) => caller.contractingJobs.jobs.patch({ id: job.id, description: 'Changed' }),
  assign: (caller, { job, spare }) =>
    caller.contractingJobs.assignments.add({ jobId: job.id, machineId: spare.id, implementId: null }),
  patchTravel: (caller, { stint }) => caller.contractingJobs.assignments.patch({ id: stint.id, travelIncluded: false }),
  editMeasures: (caller, { stint }, { loadsId }) =>
    caller.contractingJobs.measures.set({ assignmentId: stint.id, measureTypeId: loadsId, quantity: 3 }),
  editChargeLines: (caller, { job }) =>
    caller.contractingJobs.chargeLines.create({ jobId: job.id, description: 'Low-bed' }),
  resolveGaps: (caller, { stint }) =>
    caller.contractingJobs.assignments.resolveGap({
      id: stint.id,
      travelHours: 0,
      unaccountedHours: 0,
      reason: 'Yard',
    }),
  editSignOffDetails: (caller, { job }) => caller.contractingJobs.jobs.patch({ id: job.id, notes: 'Signed off' }),
  editDieselLitres: (caller, { job }) => caller.contractingJobs.jobs.patch({ id: job.id, dieselLitres: 5 }),
  complete: (caller, { job }) =>
    caller.contractingJobs.jobs.complete({
      id: job.id,
      startDate: DateOnlyIso.parse('2026-09-01'),
      endDate: DateOnlyIso.parse('2026-09-02'),
      dieselLitres: 0,
      notes: null,
      removePlannedAssignmentIds: [],
    }),
  cancel: (caller, { job }) => caller.contractingJobs.jobs.cancel({ id: job.id, reason: 'Rained out' }),
  price: (caller, { job }) => caller.contractingJobs.pricing.setDiscount({ jobId: job.id, discount: null }),
  stampInvoice: (caller, { job }) =>
    caller.contractingJobs.invoicing.stamp({ id: job.id, invoiceNumber: 'INV-1', expectedTotal: 0.01 }),
  amendReadings: (caller, { arrivalReadingId }) =>
    arrivalReadingId === null
      ? null
      : caller.contractingReadings.amend({ id: arrivalReadingId, value: 100, reason: 'Checked the photo' }),
  // Capture arrives over multipart HTTP, so it is judged where that route hands over: the core capture.
  capture: (_caller, { job, spare }, { db }, role) =>
    captureReading({
      db,
      actor: accessForRole(role, callerId),
      input: {
        machineId: spare.id,
        role: 'arrival',
        value: 5,
        capturedAt: '2026-09-20T08:00:00Z',
        disputePrevious: false,
        startAssignment: { jobId: job.id, localId: randomUUID(), implementId: null },
      },
    }),
};

/** The Job Action a write was refused under, if a Job Action refused it. */
function refusalOf(error: unknown): { action: string; reason: string } | undefined {
  if (error instanceof TRPCError) return getTRPCPublicMetadata(error) as { action: string; reason: string } | undefined;
  if (isReadingError(error)) return error.refused;
  return undefined;
}

async function settle(write: Promise<unknown>) {
  try {
    await write;
    return null;
  } catch (error) {
    return error;
  }
}

function expectAgreement(verdict: JobActionVerdict, error: unknown, label: string) {
  const refused = refusalOf(error);
  if (verdict.allowed) {
    // Allowed means no Job Action refused it; an input the fixture cannot satisfy may still fail.
    expect(refused, label).toBeUndefined();
    expect(error instanceof TRPCError && error.code === 'FORBIDDEN', label).toBe(false);
    return;
  }
  expect(error, label).toBeTruthy();
  if (verdict.reason === 'no-permission' && error instanceof TRPCError && error.code === 'FORBIDDEN' && !refused)
    return;
  expect(refused?.reason, label).toBe(verdict.reason);
}

const roles: ContractingRole[] = ['contracting-manager', 'contracting-admin', 'foreman', 'contracting-invoicing'];
const statuses: JobStatus[] = ['upcoming', 'active', 'completed', 'priced'];
const readable: Record<string, readonly JobStatus[]> = {
  foreman: ['upcoming', 'active', 'completed'],
  'contracting-invoicing': ['completed', 'priced'],
};

const cases = roles.flatMap((role) =>
  statuses.filter((status) => (readable[role] ?? statuses).includes(status)).map((status) => [role, status] as const),
);

describe('Job Actions served on the Job agree with what the server does', () => {
  test.for(cases)('%s on a %s Job', async ([role, status], { context }) => {
    const session = mockSession(null);
    session.user.contractingRole = role;
    const caller = context.createCaller(session);
    const shown = await context.jobAt(status);
    const { actions } = await caller.contractingJobs.jobs.get({ id: shown.job.id });
    for (const [action, attempt] of Object.entries(attempts) as [JobActionName, (typeof attempts)[JobActionName]][]) {
      const write = attempt(caller, await context.jobAt(status), context, role);
      if (write === null) continue;
      expectAgreement(actions[action], await settle(write), `${role} · ${status} · ${action}`);
    }
  });
});
