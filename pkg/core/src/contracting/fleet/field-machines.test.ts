import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createJob } from '../jobs/job-service.js';
import { captureStintHours } from '../jobs/stint-hours-service.js';
import { captureReading, listFieldReadingsPage } from '../readings/reading-service.js';
import { admin, foreman, foremanId, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
import { listFieldMachines } from './machine-service.js';

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const job = (foremanUserId: string | null) =>
    createJob({
      db,
      actor: admin,
      input: {
        customerId: fixtures.customer.id,
        farmId: fixtures.farm.id,
        workTypeId: fixtures.workType.id,
        description: null,
        foremanUserId,
      },
    });
  const own = await job(foremanId);
  const other = await job(null);
  const arrive = async (jobId: string, machineId: string) => {
    const stint = await plannedStint(db, admin, { jobId, machineId, implementId: null });
    await captureStintHours({ db, actor: admin, input: { assignmentId: stint.id, role: 'arrival', hours: 100 } });
  };
  await arrive(own.id, fixtures.excavator.id);
  await arrive(other.id, fixtures.tipper.id);
  return { ...fixtures, own, other };
});

test("a Foreman sees the customer and farm only of their own Job's Machines", async ({ context }) => {
  const { db, excavator, tipper, own } = context;
  const byCode = async (actor: typeof admin) =>
    new Map((await listFieldMachines({ db, actor })).map((machine) => [machine.code, machine]));
  const foremanView = await byCode(foreman);
  expect(foremanView.get(excavator.code)?.busyOnJob).toMatchObject({
    id: own.id,
    customerName: 'Rowley',
    farmName: 'Rooikraal',
    workTypeName: 'Dam building',
    foremanUserId: foremanId,
  });
  expect(foremanView.get(tipper.code)?.busyOnJob).toBeNull();
  expect(foremanView.get(tipper.code)?.onSiteJobNumber).toMatch(/^CJOB-/);
  const adminView = await byCode(admin);
  expect(adminView.get(tipper.code)?.busyOnJob?.customerName).toBe('Rowley');
});

test('pages a Machine’s readings newest first, and limit 0 reads them all', async ({ context }) => {
  const { db, excavator } = context;
  const spot = (value: number, capturedAt: string) =>
    captureReading({ db, actor: admin, input: { machineId: excavator.id, value, capturedAt } });
  await spot(100, '2026-09-01T08:00:00+02:00');
  await spot(120, '2026-09-02T08:00:00+02:00');
  const first = await listFieldReadingsPage({ db, input: { machineId: excavator.id, cursor: 0, limit: 1 } });
  expect(first).toMatchObject({ total: 2, nextCursor: 1, items: [{ value: 120, capturedByName: expect.any(String) }] });
  const second = await listFieldReadingsPage({ db, input: { machineId: excavator.id, cursor: 1, limit: 1 } });
  expect(second).toMatchObject({ nextCursor: null, items: [{ value: 100 }] });
  const all = await listFieldReadingsPage({ db, input: { machineId: excavator.id, cursor: 0, limit: 0 } });
  expect(all.items).toHaveLength(2);
});
