import { auditEvents } from '@pkg/db';
import { contractingJobs, contractingMeasures } from '@pkg/db/contracting';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import {
  admin,
  captureHours,
  completedJob,
  foreman,
  foremanId,
  plannedStint,
  pricedJob,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import { removeAssignment } from './assignment-service.js';
import { getJob } from './job-read.js';
import { createJob } from './job-service.js';
import { setMeasure } from './measure-service.js';

const test = createTester(async ({ db }) => seedJobFixtures(db));

describe('removing a Machine Assignment', () => {
  test('the Foreman removes an on-site and a left stint on his Active Job with a reason; the other stints stay', async ({
    context,
  }) => {
    const { db, excavator, tipper, loads } = context;
    const job = await createJob({
      db,
      actor: admin,
      input: {
        customerId: context.customer.id,
        farmId: context.farm.id,
        workTypeId: context.workType.id,
        description: null,
        foremanUserId: foremanId,
      },
    });
    const plan = (machineId: string) => plannedStint(db, foreman, { jobId: job.id, machineId, implementId: null });
    const first = await plan(excavator.id);
    await captureHours(db, first.id, 'arrival', 100);
    await captureHours(db, first.id, 'departure', 120);
    const second = await plan(excavator.id);
    await captureHours(db, second.id, 'arrival', 130);
    const onSite = await plan(tipper.id);
    await captureHours(db, onSite.id, 'arrival', 50);
    await setMeasure({ db, actor: foreman, input: { assignmentId: onSite.id, measureTypeId: loads.id, quantity: 4 } });
    const planned = await plan(tipper.id);

    await expect(removeAssignment({ db, actor: foreman, input: { id: onSite.id } })).rejects.toMatchObject({
      code: 'contracting_job.reason_required',
    });
    await removeAssignment({ db, actor: foreman, input: { id: onSite.id, reason: ' Added by accident ' } });
    await removeAssignment({ db, actor: foreman, input: { id: first.id, reason: 'Wrong Machine' } });
    await removeAssignment({ db, actor: foreman, input: { id: planned.id } });

    expect(await getJob({ db, id: job.id })).toMatchObject({
      status: 'active',
      assignments: [{ id: second.id, arrival: { hours: 130 } }],
    });
    expect(await db.select().from(contractingMeasures)).toEqual([]);
    const summaries = (await db.select({ summary: auditEvents.summary }).from(auditEvents)).map((row) => row.summary);
    expect(summaries).toEqual(
      expect.arrayContaining([
        'Removed Machine Assignment "TIP-7": Added by accident',
        'Removed Machine Assignment "CAT320-1": Wrong Machine',
        'Deleted Machine Assignment "TIP-7"',
      ]),
    );
  });

  test("removing an Active Job's only arrival returns it to Upcoming, as if it never started", async ({ context }) => {
    const { db, excavator, tipper } = context;
    const job = await createJob({
      db,
      actor: admin,
      input: {
        customerId: context.customer.id,
        farmId: context.farm.id,
        workTypeId: context.workType.id,
        description: null,
        foremanUserId: foremanId,
      },
    });
    const arrived = await plannedStint(db, admin, { jobId: job.id, machineId: excavator.id, implementId: null });
    const waiting = await plannedStint(db, admin, { jobId: job.id, machineId: tipper.id, implementId: null });
    await captureHours(db, arrived.id, 'arrival', 100);

    await removeAssignment({ db, actor: admin, input: { id: arrived.id, reason: 'Wrong Job' } });

    const [row] = await db.select().from(contractingJobs).where(eq(contractingJobs.id, job.id));
    expect(row).toMatchObject({ status: 'upcoming', activatedAt: null, activatedByUserId: null });
    expect((await getJob({ db, id: job.id })).assignments.map((stint) => stint.id)).toEqual([waiting.id]);
  });

  test('the Foreman is refused once the Job is Completed; management reopens a Priced Job for re-pricing', async ({
    context,
  }) => {
    const { db, excavator, tipper } = context;
    const completed = await completedJob(context, [{ machineId: excavator.id, arrival: 100, departure: 150 }]);
    const [signedOff] = completed.stints;
    if (!signedOff) throw new Error('Expected a stint');
    await expect(
      removeAssignment({ db, actor: foreman, input: { id: signedOff.id, reason: 'Added by accident' } }),
    ).rejects.toMatchObject({
      code: 'contracting_job.wrong_status',
      message: 'You can only remove a Machine Assignment while the Job is Upcoming or Active.',
    });

    const priced = await pricedJob(context, [
      { machineId: excavator.id, arrival: 200, departure: 210 },
      { machineId: tipper.id, arrival: 300, departure: 320 },
    ]);
    const [kept, removed] = priced.stints;
    if (!kept || !removed) throw new Error('Expected two stints');
    await removeAssignment({ db, actor: admin, input: { id: removed.id, reason: 'Never on this Job' } });

    expect(await getJob({ db, id: priced.jobId })).toMatchObject({
      status: 'completed',
      repricingNote: 'TIP-7 removed — amounts recomputed.',
      assignments: [{ id: kept.id, pricing: { finalAmount: 36_000 } }],
    });
  });
});
