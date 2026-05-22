import { auditEvents, type Db, jobStageStations, products } from '@pkg/db';
import type { Station } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createActorUser } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { expectIsoDatetime, mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'job-supervisor');
  const product = await createProduct(db);

  return { db, product };
});

describe('stations.create', () => {
  test('allows admins to create stations', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const station = await createStation(caller, 'Weld Bay 1', 'fabrication');

    expect(station).toMatchObject({
      department: 'fabrication',
      displayOrder: 10,
      isActive: true,
      name: 'Weld Bay 1',
    });
    expectIsoDatetime(station.createdAt);
    expectIsoDatetime(station.updatedAt);
  });

  test('rejects job supervisors without station update permission', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));

    await expect(
      caller.stations.create({
        department: 'fabrication',
        displayOrder: 10,
        name: 'Weld Bay 1',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('returns a clean conflict for duplicate names inside a department', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    await createStation(caller, 'Weld Bay 1', 'fabrication');

    await expect(createStation(caller, 'Weld Bay 1', 'fabrication')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A station with this name already exists in that Department.',
    });
    await expect(createStation(caller, 'Weld Bay 1', 'paint')).resolves.toMatchObject({
      department: 'paint',
      name: 'Weld Bay 1',
    });
  });
});

describe('stations.list', () => {
  test('allows product editors to read stations for Product defaults', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const productEditorCaller = context.createCaller(mockSession('product-editor'));

    await createStation(adminCaller, 'Weld Bay 1', 'fabrication');

    const result = await productEditorCaller.stations.list({ department: 'fabrication', isActive: true });

    expect(result.map((station) => station.name)).toEqual(['Weld Bay 1']);
  });

  test('lists and filters stations by department and active state', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    await createStation(caller, 'Assembly Bench 1', 'assembly', 30);
    const active = await createStation(caller, 'Weld Bay 1', 'fabrication', 20);
    const inactive = await createStation(caller, 'Weld Bay 2', 'fabrication', 10);
    await createStation(caller, 'Paint Booth A', 'paint', 5);
    await caller.stations.setActive({ id: inactive.id, isActive: false });

    const allFabrication = await caller.stations.list({ department: 'fabrication' });
    const activeFabrication = await caller.stations.list({ department: 'fabrication', isActive: true });
    const allStations = await caller.stations.list({});

    expect(allFabrication.map((station) => station.name)).toEqual(['Weld Bay 2', 'Weld Bay 1']);
    expect(activeFabrication.map((station) => station.id)).toEqual([active.id]);
    expect(allStations.map((station) => station.name)).toEqual([
      'Assembly Bench 1',
      'Weld Bay 2',
      'Weld Bay 1',
      'Paint Booth A',
    ]);
  });
});

describe('stations.update', () => {
  test('renames, reorders, deactivates, and reactivates stations', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const station = await createStation(caller, 'Weld Bay 1', 'fabrication');

    const updated = await caller.stations.update({
      id: station.id,
      displayOrder: 5,
      name: 'Weld Cell 1',
    });
    const deactivated = await caller.stations.setActive({ id: station.id, isActive: false });
    const reactivated = await caller.stations.setActive({ id: station.id, isActive: true });

    expect(updated).toMatchObject({ displayOrder: 5, name: 'Weld Cell 1' });
    expect(deactivated.isActive).toBe(false);
    expect(reactivated.isActive).toBe(true);
  });

  test('records audit events for catalog changes', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const station = await createStation(caller, 'Weld Bay 1', 'fabrication');
    await caller.stations.update({ id: station.id, displayOrder: 5, name: 'Weld Cell 1' });
    await caller.stations.setActive({ id: station.id, isActive: false });

    const events = await context.db
      .select({
        action: auditEvents.action,
        changes: auditEvents.changes,
        entityId: auditEvents.entityId,
        entityType: auditEvents.entityType,
        summary: auditEvents.summary,
      })
      .from(auditEvents);

    expect(events).toMatchObject([
      {
        action: 'created',
        entityId: station.id,
        entityType: 'station',
        summary: 'Created station "Weld Bay 1"',
      },
      {
        action: 'updated',
        changes: {
          displayOrder: { from: 10, to: 5 },
          name: { from: 'Weld Bay 1', to: 'Weld Cell 1' },
        },
        entityId: station.id,
        entityType: 'station',
        summary: 'Renamed station "Weld Bay 1" to "Weld Cell 1"',
      },
      {
        action: 'updated',
        changes: {
          isActive: { from: true, to: false },
        },
        entityId: station.id,
        entityType: 'station',
        summary: 'Updated station "Weld Cell 1"',
      },
    ]);
  });

  test('rejects job supervisors without station update permission', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const station = await createStation(adminCaller, 'Weld Bay 1', 'fabrication');

    await expect(
      supervisorCaller.stations.update({
        id: station.id,
        displayOrder: 5,
        name: 'Weld Cell 1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(supervisorCaller.stations.setActive({ id: station.id, isActive: false })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('station booking history', () => {
  test('keeps historical bookings resolvable after station deactivation', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const station = await createStation(caller, 'Weld Bay 1', 'fabrication');
    const job = await caller.jobs.create({ productId: context.product.id });
    const stage = job.stages.find((candidate) => candidate.stage === 'fabrication');

    if (!stage) {
      throw new Error('Expected fabrication stage');
    }

    await context.db.insert(jobStageStations).values({
      dueEnd: '2026-06-03',
      dueStart: '2026-06-01',
      jobStageId: stage.id,
      stationId: station.id,
    });

    await caller.stations.setActive({ id: station.id, isActive: false });

    const activeStations = await caller.stations.list({ department: 'fabrication', isActive: true });
    const fetchedJob = await caller.jobs.get({ id: job.id });
    const fetchedStage = fetchedJob.stages.find((candidate) => candidate.stage === 'fabrication');

    expect(activeStations.map((candidate) => candidate.id)).not.toContain(station.id);
    expect(fetchedStage?.stations).toHaveLength(1);
    expect(fetchedStage?.stations[0]?.station).toMatchObject({
      id: station.id,
      isActive: false,
      name: 'Weld Bay 1',
    });
  });
});

async function createStation(
  caller: AppRouterCaller,
  name: string,
  department: Station['department'],
  displayOrder = 10,
): Promise<Station> {
  return caller.stations.create({
    department,
    displayOrder,
    name,
  });
}

async function createProduct(db: Db) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 100_000,
      currencyCode: 'ZAR',
      modelCode: 'STATION-TEST',
      name: 'Station Test Product',
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}
