import type { Db } from '@pkg/db';
import { contractingBreakdowns, contractingHourReadings } from '@pkg/db/contracting';
import { type AppPermission, DateOnlyIso } from '@pkg/schema';
import { FleetHistoryListInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createJob } from '../jobs/job-service.js';
import { closeServiceRecord, openServiceRecord } from '../services/service-record-service.js';
import { admin, adminId, foremanId, leftStint, seedJobFixtures } from '../test/job-fixtures.js';
import { createCategory } from './category-service.js';
import { listFleetHistory, listFleetHistoryFilterOptions } from './fleet-history.js';
import { createImplement } from './implement-service.js';

const without = (permission: AppPermission) => ({
  ...admin,
  permissions: admin.permissions.filter((held) => held !== permission),
});

/** A Machine with a stint, a Breakdown on it, a closed service and a John Deere reading, and a Breakdown on an Implement. */
const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const machineId = fixtures.excavator.id;
  const job = await createJob({
    db,
    actor: admin,
    input: {
      customerId: fixtures.customer.id,
      farmId: fixtures.farm.id,
      workTypeId: fixtures.workType.id,
      description: null,
      foremanUserId: foremanId,
    },
  });
  // Arrives 2026-09-01 05:00Z at 1 000 h, leaves 06:00Z at 1 001 h.
  const stint = await leftStint(db, job.id, machineId, 1000, 1001);
  const [breakdown] = await db
    .insert(contractingBreakdowns)
    .values({
      machineId,
      jobId: job.id,
      reportedByUserId: adminId,
      reportedAt: new Date('2026-09-01T12:00:00Z'),
      urgency: 'code-red',
      description: 'Hydraulic leak\nunder the boom',
    })
    .returning();
  const service = await openServiceRecord({
    db,
    actorUserId: adminId,
    input: { machineId, startDate: DateOnlyIso.parse('2026-09-01'), primaryMechanicUserId: null, notes: null },
  });
  await closeServiceRecord({
    db,
    actorUserId: adminId,
    input: {
      id: service.id,
      endDate: DateOnlyIso.parse('2026-09-02'),
      readingAtServiceHours: 1001,
      primaryMechanicUserId: null,
      notes: null,
      nextServiceDueHours: 1501,
    },
  });
  const [telematics] = await db
    .insert(contractingHourReadings)
    .values({
      machineId,
      role: 'spot',
      value: 1002,
      capturedAt: new Date('2026-09-02T08:00:00Z'),
      method: 'telematics',
      telematicsProvider: 'john-deere',
      aiVerification: 'not-applicable',
    })
    .returning();
  const implementCategory = await createCategory({
    db,
    actorUserId: adminId,
    input: { name: 'Rippers', kind: 'implement' },
  });
  const implement = await createImplement({
    db,
    actorUserId: adminId,
    input: { code: 'RIP-1', categoryId: implementCategory.id, notes: null },
  });
  await db.insert(contractingBreakdowns).values({
    implementId: implement.id,
    reportedByUserId: adminId,
    reportedAt: new Date('2026-09-03T09:00:00Z'),
    urgency: 'code-green',
    description: 'Bent tine',
  });
  if (!breakdown || !telematics) throw new Error('Expected the History rows');
  return { breakdown, implementId: implement.id, job, machineId, service, stint, telematics };
});

type Context = { db: Db; machineId: string };
const history = (context: Context, input: Partial<FleetHistoryListInput> = {}, actor = admin) =>
  listFleetHistory({
    db: context.db,
    actor,
    input: FleetHistoryListInput.parse({
      subject: { kind: 'machine', id: context.machineId },
      limit: 0,
      ...input,
    }),
  });
const titles = async (...args: Parameters<typeof history>) => (await history(...args)).items.map((row) => row.title);

test('lists readings, Breakdowns and services as one newest-first timeline, a service on its plant day', async ({
  context,
}) => {
  const { breakdown, job, service, stint, telematics } = context;
  expect(await history(context)).toEqual({
    total: 5,
    nextCursor: null,
    items: [
      {
        id: telematics.id,
        kind: 'reading',
        at: '2026-09-02T08:00:00.000Z',
        title: 'Spot · 1 002.0 h',
        detail: null,
        evidence: 'John Deere',
        readingRole: 'spot',
        breakdown: null,
        opens: null,
      },
      {
        id: service.id,
        kind: 'service',
        at: '2026-09-02',
        title: 'Service · 1 001.0 h',
        detail: 'Next service due set to 1 501.0 h',
        evidence: null,
        readingRole: null,
        breakdown: null,
        opens: { to: 'service' },
      },
      {
        id: breakdown.id,
        kind: 'breakdown',
        at: '2026-09-01T12:00:00.000Z',
        title: 'Hydraulic leak',
        detail: `${job.jobNumber} · reported by Jed`,
        evidence: null,
        readingRole: null,
        breakdown: { urgency: 'code-red', status: 'open' },
        opens: { to: 'breakdown', id: breakdown.id },
      },
      expect.objectContaining({
        id: stint.departureReadingId,
        title: 'Departure · 1 001.0 h',
        detail: job.jobNumber,
        evidence: 'Missing Photo Evidence',
        opens: { to: 'job', jobNumber: job.jobNumber },
      }),
      expect.objectContaining({ id: stint.arrivalReadingId, title: 'Arrival · 1 000.0 h', detail: job.jobNumber }),
    ],
  });
});

test('pages, sorts, searches and filters in SQL', async ({ context }) => {
  const firstPage = await history(context, { limit: 2 });
  expect(firstPage).toMatchObject({ total: 5, nextCursor: 2 });
  expect(firstPage.items.map((row) => row.kind)).toEqual(['reading', 'service']);
  expect((await history(context, { limit: 2, cursor: 4 })).items.map((row) => row.title)).toEqual([
    'Arrival · 1 000.0 h',
  ]);
  expect((await history(context, { sortBy: 'kind', sortDirection: 'asc' })).items.map((row) => row.kind)).toEqual([
    'breakdown',
    'reading',
    'reading',
    'reading',
    'service',
  ]);
  expect(await titles(context, { sortDirection: 'asc' })).toEqual([
    'Arrival · 1 000.0 h',
    'Departure · 1 001.0 h',
    'Hydraulic leak',
    'Service · 1 001.0 h',
    'Spot · 1 002.0 h',
  ]);
  expect(await titles(context, { search: '1 001.0' })).toEqual(['Service · 1 001.0 h', 'Departure · 1 001.0 h']);
  expect(await titles(context, { search: 'code red' })).toEqual(['Hydraulic leak']);
  expect(await titles(context, { search: context.job.jobNumber })).toEqual([
    'Departure · 1 001.0 h',
    'Arrival · 1 000.0 h',
  ]);
  expect(await titles(context, { kinds: ['service', 'breakdown'] })).toEqual(['Service · 1 001.0 h', 'Hydraulic leak']);
  expect(await titles(context, { from: DateOnlyIso.parse('2026-09-02') })).toEqual([
    'Spot · 1 002.0 h',
    'Service · 1 001.0 h',
  ]);
  expect(await titles(context, { to: DateOnlyIso.parse('2026-09-01') })).toEqual([
    'Hydraulic leak',
    'Departure · 1 001.0 h',
    'Arrival · 1 000.0 h',
  ]);
});

test('lists only the kinds the caller may read, and an Implement only its Breakdowns', async ({ context }) => {
  const noServices = without('contracting_service:read');
  const machine = { kind: 'machine', id: context.machineId } as const;
  const implement = { kind: 'implement', id: context.implementId } as const;
  expect(listFleetHistoryFilterOptions({ actor: noServices, subject: machine })).toEqual({
    kinds: ['reading', 'breakdown'],
  });
  expect((await history(context, {}, noServices)).items.map((row) => row.kind)).toEqual([
    'reading',
    'breakdown',
    'reading',
    'reading',
  ]);
  expect((await history(context, { kinds: ['service'] }, noServices)).total).toBe(0);
  expect(
    (await history(context, {}, without('contracting_breakdown:read'))).items.some((row) => row.kind === 'breakdown'),
  ).toBe(false);
  expect(listFleetHistoryFilterOptions({ actor: admin, subject: implement })).toEqual({ kinds: ['breakdown'] });
  expect(await titles(context, { subject: implement })).toEqual(['Bent tine']);
});
