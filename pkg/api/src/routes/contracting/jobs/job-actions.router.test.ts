import {
  captureReading,
  completeJob,
  createAssignment,
  createCategory,
  createChargeLine,
  createCustomer,
  createFarm,
  createJob,
  createMachine,
  createMeasureType,
  createRate,
  createWorkType,
  getJob,
  isBreakdownError,
  isReadingError,
  markPriced,
  patchChargeLine,
  reportBreakdown,
  setStintRate,
} from '@pkg/core/contracting';
import { type Db, user } from '@pkg/db';
import { jobReadMode, jobReadSeesMoney } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole } from '@pkg/schema';
import { DateOnlyIso } from '@pkg/schema';
import {
  type AssignmentActionName,
  type AssignmentActionVerdict,
  type AssignmentState,
  assignmentActionNames,
  type JobActionName,
  type JobActionVerdict,
  type JobStatus,
} from '@pkg/schema/contracting';
import { TRPCError } from '@trpc/server';
import { describe, expect } from 'vitest';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { getTRPCAppCode, getTRPCPublicMetadata } from '@/trpc/errors.js';

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

  /**
   * A fresh Job in the given status, with one worked stint on its own Machine and a spare Machine to add. An Active
   * Job also holds a planned stint and one that has already left, so every stint state is judged while the Job runs.
   */
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
    await createAssignment({
      db,
      actor: setup,
      input: { jobId: job.id, machineId: worked.id, implementId: null },
    });
    const [planned] = (await getJob({ db, id: job.id })).assignments;
    if (!planned) throw new Error('Expected Machine Assignment');
    const stint = { id: planned.id, machineId: worked.id };
    const capture = (role: 'arrival' | 'departure', value: number, on: { id: string; machineId: string } = stint) =>
      captureReading({
        db,
        actor: setup,
        input: {
          machineId: on.machineId,
          assignmentId: on.id,
          role,
          value,
          capturedAt: new Date(Date.parse('2026-09-01T06:00:00Z') + ++sequence * 60_000).toISOString(),
          disputePrevious: false,
          ...(role === 'departure' ? { comment: 'Photo unavailable' } : {}),
        },
      });
    const fixture: Fixture = {
      job,
      stint,
      spare,
      arrivalReadingId: null,
      chargeLineId: null,
      stints: [{ ...stint, state: 'planned' }],
    };
    if (status === 'upcoming') return fixture;
    fixture.arrivalReadingId = (await capture('arrival', 100)).id;
    const plan = async () => {
      const added = await machine();
      await createAssignment({ db, actor: setup, input: { jobId: job.id, machineId: added.id, implementId: null } });
      const found = (await getJob({ db, id: job.id })).assignments.find((each) => each.machineId === added.id);
      if (!found) throw new Error('Expected planned Machine Assignment');
      return { id: found.id, machineId: added.id };
    };
    const gone = await plan();
    await capture('arrival', 10, gone);
    await capture('departure', 20, gone);
    const later = await plan();
    fixture.stints = [
      { ...stint, state: 'on-site' },
      { ...later, state: 'planned' },
      { ...gone, state: 'left' },
    ];
    await createChargeLine({ db, actor: setup, input: { jobId: job.id, description: 'Low-bed' } });
    const [line] = (await getJob({ db, id: job.id })).chargeLines;
    if (!line) throw new Error('Expected Charge Line');
    fixture.chargeLineId = line.id;
    await patchChargeLine({ db, actor: setup, input: { id: line.id, amount: 0 } });
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
        removePlannedAssignmentIds: [later.id],
      },
    });
    fixture.stints = [
      { ...stint, state: 'left' },
      { ...gone, state: 'left' },
    ];
    if (status === 'completed') return fixture;
    for (const each of [stint, gone])
      await setStintRate({ db, actor: setup, input: { assignmentId: each.id, rateId: rate.id } });
    const total = (await getJob({ db, id: job.id })).pricing.total;
    await markPriced({ db, actor: setup, input: { id: job.id, expectedTotal: total } });
    return fixture;
  }

  return { db, jobAt, loadsId: loads.id, rateId: rate.id };
});

type StintFixture = { id: string; machineId: string; state: AssignmentState };
type Fixture = {
  job: { id: string };
  stint: { id: string; machineId: string };
  spare: { id: string };
  arrivalReadingId: string | null;
  chargeLineId: string | null;
  /** Every stint on the Job, in each state it holds one. */
  stints: StintFixture[];
};
type Seeded = { db: Db; loadsId: string; rateId: string };

/** One write per Job Action, as a surface asks for it; null where the fixture has nothing to act on. */
const attempts: Record<
  JobActionName,
  (caller: AppRouterCaller, fixture: Fixture, seeded: Seeded, role: ContractingRole) => Promise<unknown> | null
> = {
  editSetup: (caller, { job }) => caller.contractingJobs.jobs.patch({ id: job.id, description: 'Changed' }),
  assignForeman: (caller, { job }) => caller.contractingJobs.jobs.patch({ id: job.id, foremanUserId: callerId }),
  assign: (caller, { job, spare }) =>
    caller.contractingJobs.assignments.add({ jobId: job.id, machineId: spare.id, implementId: null }),
  patchTravel: (caller, { stint }) => caller.contractingJobs.assignments.patch({ id: stint.id, travelIncluded: false }),
  editMeasures: (caller, { stint }, { loadsId }) =>
    caller.contractingJobs.measures.set({ assignmentId: stint.id, measureTypeId: loadsId, quantity: 3 }),
  editChargeLines: (caller, { job }) =>
    caller.contractingJobs.chargeLines.create({ jobId: job.id, description: 'Low-bed' }),
  priceChargeLines: (caller, { chargeLineId }) =>
    chargeLineId === null ? null : caller.contractingJobs.chargeLines.patch({ id: chargeLineId, amount: 1 }),
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
  capture: (_caller, { stint }, { db }, role) =>
    captureReading({
      db,
      actor: accessForRole(role, callerId),
      input: {
        machineId: stint.machineId,
        assignmentId: stint.id,
        role: 'arrival',
        value: 500,
        capturedAt: '2026-09-20T08:00:00Z',
        disputePrevious: false,
      },
    }),
  // Reporting arrives over multipart HTTP too, so it is judged at the core report.
  reportBreakdown: (_caller, { job, stint }, { db }, role) =>
    reportBreakdown({
      db,
      actor: accessForRole(role, callerId),
      input: {
        subject: { kind: 'machine', id: stint.machineId },
        jobId: job.id,
        urgency: 'code-green',
        description: 'Leaking',
      },
    }),
};

/** The Job Action a write was refused under, if a Job Action refused it. */
function refusalOf(error: unknown): { action: string; reason: string } | undefined {
  if (error instanceof TRPCError) return getTRPCPublicMetadata(error) as { action: string; reason: string } | undefined;
  if (isReadingError(error) || isBreakdownError(error)) return error.refused;
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

const moneyFields = ['diesel', 'discount', 'pricedTotal', 'reopenedAt', 'repricingNote', 'pricing'] as const;

describe('money reaches only the readers the server sends it to', () => {
  test.for(cases)('%s on a %s Job', async ([role, status], { context }) => {
    const session = mockSession(null);
    session.user.contractingRole = role;
    const job = await context
      .createCaller(session)
      .contractingJobs.jobs.get({ id: (await context.jobAt(status)).job.id });
    const seesMoney = jobReadSeesMoney(jobReadMode(accessForRole(role, callerId)) ?? 'all');
    expect(job.seesMoney).toBe(seesMoney);
    if (seesMoney) return;
    for (const field of moneyFields) expect(job[field], field).toBeNull();
    for (const stint of job.assignments) expect(stint.pricing).toBeNull();
    for (const line of job.chargeLines) expect(line.amount).toBeNull();
  });
});

const stintCapture = (db: Db, role: ContractingRole, stint: StintFixture, reading: 'arrival' | 'departure') =>
  captureReading({
    db,
    actor: accessForRole(role, callerId),
    input: {
      machineId: stint.machineId,
      assignmentId: stint.id,
      role: reading,
      value: reading === 'arrival' ? 500 : 600,
      capturedAt: reading === 'arrival' ? '2026-09-20T08:00:00Z' : '2026-09-21T08:00:00Z',
      disputePrevious: false,
      comment: 'Photo unavailable',
    },
  });

/** One write per Assignment Action, as a surface asks for it on one stint. */
const stintAttempts: Record<
  AssignmentActionName,
  (caller: AppRouterCaller, stint: StintFixture, seeded: Seeded, role: ContractingRole) => Promise<unknown>
> = {
  remove: (caller, stint) => caller.contractingJobs.assignments.remove({ id: stint.id }),
  changeResources: (caller, stint) => caller.contractingJobs.assignments.patch({ id: stint.id, driverUserId: null }),
  // Capture arrives over multipart HTTP, so it is judged where that route hands over: the core capture.
  captureArrival: (_caller, stint, { db }, role) => stintCapture(db, role, stint, 'arrival'),
  captureDeparture: (_caller, stint, { db }, role) => stintCapture(db, role, stint, 'departure'),
  editMeasures: (caller, stint, { loadsId }) =>
    caller.contractingJobs.measures.set({ assignmentId: stint.id, measureTypeId: loadsId, quantity: 3 }),
  resolveGap: (caller, stint) =>
    caller.contractingJobs.assignments.resolveGap({
      id: stint.id,
      travelHours: 0,
      unaccountedHours: 0,
      reason: 'Yard',
    }),
  price: (caller, stint, { rateId }) => caller.contractingJobs.pricing.setStintRate({ assignmentId: stint.id, rateId }),
};

const isCapture = (action: AssignmentActionName) => action === 'captureArrival' || action === 'captureDeparture';

function errorCode(error: unknown): string | undefined {
  if (error instanceof TRPCError) return getTRPCAppCode(error);
  if (isReadingError(error)) return error.code;
  return undefined;
}

function expectStintAgreement(
  action: AssignmentActionName,
  verdict: AssignmentActionVerdict,
  error: unknown,
  label: string,
) {
  const stateCode = isCapture(action) ? 'reading.invalid_role' : 'contracting_job.wrong_status';
  if (verdict.allowed || verdict.reason !== 'wrong-state') {
    expectAgreement(verdict as JobActionVerdict, error, label);
    // A state refusal names no Job Action, so `expectAgreement` alone would let one through an allowed verdict.
    if (verdict.allowed) expect(errorCode(error), label).not.toBe(stateCode);
    return;
  }
  // The state refused: the write's own family's wrong-state code, and no Job Action named.
  expect(errorCode(error), label).toBe(stateCode);
  expect(error instanceof Error ? error.message : undefined, label).toBe(verdict.message);
  expect(refusalOf(error), label).toBeUndefined();
}

describe('Assignment Actions served on each stint agree with what the server does', () => {
  test.for(cases)('%s on a %s Job', async ([role, status], { context }) => {
    const session = mockSession(null);
    session.user.contractingRole = role;
    const caller = context.createCaller(session);
    const shown = await caller.contractingJobs.jobs.get({ id: (await context.jobAt(status)).job.id });
    for (const assignment of shown.assignments) {
      for (const action of assignmentActionNames) {
        const stint = (await context.jobAt(status)).stints.find((each) => each.state === assignment.state);
        if (!stint) throw new Error(`Expected a ${assignment.state} stint`);
        const write = stintAttempts[action](caller, stint, context, role);
        const label = `${role} · ${status} · ${assignment.state} · ${action}`;
        expectStintAgreement(action, assignment.actions[action], await settle(write), label);
      }
    }
  });
});
