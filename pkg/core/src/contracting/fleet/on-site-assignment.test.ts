import { contractingMachineAssignments } from '@pkg/db/contracting';
import { parseJobNumber } from '@pkg/domain/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createJob } from '../jobs/job-service.js';
import { admin, captureHours, foremanId, plannedStint, seedJobFixtures } from '../test/job-fixtures.js';
import { createCategory } from './category-service.js';
import { createImplement } from './implement-service.js';
import { onSiteAssignment } from './on-site-assignment.js';

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
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
  return { ...fixtures, job };
});

const capture = (
  db: Parameters<typeof captureHours>[0],
  stint: { id: string },
  role: 'arrival' | 'departure',
  value: number,
) => captureHours(db, stint.id, role, value);

test('names the on-site stint and its Job, and nothing for a planned, left or yard Machine', async ({ context }) => {
  const { db, excavator, tipper, job } = context;
  const subject = { kind: 'machine', id: excavator.id } as const;
  const planned = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
  const stint = { id: planned.id };
  expect(await onSiteAssignment({ db, subject })).toBeNull();

  await capture(db, stint, 'arrival', 100);
  const [arrived] = await db
    .select({ arrivalAt: contractingMachineAssignments.arrivalAt })
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.id, planned.id));
  expect(await onSiteAssignment({ db, subject })).toEqual({
    stintId: planned.id,
    jobId: job.id,
    jobCode: parseJobNumber(job.jobNumber),
    foremanUserId: foremanId,
    arrivedAt: arrived?.arrivalAt,
  });
  expect(await onSiteAssignment({ db, subject: { kind: 'machine', id: tipper.id } })).toBeNull();

  await capture(db, stint, 'departure', 110);
  expect(await onSiteAssignment({ db, subject })).toBeNull();
});

test('an Implement reaches its Job through the stint it is attached to', async ({ context }) => {
  const { db, excavator, job } = context;
  const category = await createCategory({
    db,
    actorUserId: admin.userId,
    input: { name: 'Rippers', kind: 'implement' },
  });
  const ripper = await createImplement({
    db,
    actorUserId: admin.userId,
    input: { code: 'RIP-1', categoryId: category.id, notes: null },
  });
  const planned = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: ripper.id });
  await capture(db, { id: planned.id }, 'arrival', 100);
  expect(await onSiteAssignment({ db, subject: { kind: 'implement', id: ripper.id } })).toMatchObject({
    stintId: planned.id,
    jobId: job.id,
  });
});

test('two sequential stints on one Job answer the current one', async ({ context }) => {
  const { db, excavator, job } = context;
  const subject = { kind: 'machine', id: excavator.id } as const;
  const first = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
  await capture(db, { id: first.id }, 'arrival', 100);
  await capture(db, { id: first.id }, 'departure', 110);
  const second = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
  await capture(db, { id: second.id }, 'arrival', 110);
  expect(await onSiteAssignment({ db, subject })).toMatchObject({ stintId: second.id, jobId: job.id });
});
