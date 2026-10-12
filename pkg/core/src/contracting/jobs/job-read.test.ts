import { JobListInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { getContractingSettings, updateContractingSettings } from '../settings/settings-service.js';
import { admin, adminId, foremanId, leftStint, seedJobFixtures } from '../test/job-fixtures.js';
import { listJobs, summarizeJobQueues } from './job-queues.js';
import { getJob } from './job-read.js';
import { createJob } from './job-service.js';

const test = createTester(async ({ db }) => ({ ...(await seedJobFixtures(db)), db }));

test('judges an open Hour Gap against the current Gap Flag threshold on every read, in the detail and the queues alike', async ({
  context,
}) => {
  const { db, excavator } = context;
  const job = async () =>
    createJob({
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
  const first = await job();
  await leftStint(db, first.id, excavator.id, 100, 110);
  const second = await job();
  // A 3 h gap: inside the default 4 h threshold, outside a 2 h one.
  await leftStint(db, second.id, excavator.id, 113, 120);

  const detail = async () => {
    const read = await getJob({ db, id: second.id });
    return { flagged: read.assignments[0]?.gapFlag, open: read.openGapFlags, threshold: read.gapFlagThresholdHours };
  };
  const queue = async () => {
    const [summary] = (
      await listJobs({ db, actor: admin, input: JobListInput.parse({ queues: ['looks-finished'] }) })
    ).items.filter((item) => item.id === second.id);
    const totals = await summarizeJobQueues({ db, actor: admin });
    return { open: summary?.openGapFlags, attention: totals.attention['looks-finished'] };
  };
  expect(await detail()).toEqual({ flagged: false, open: 0, threshold: 4 });
  expect(await queue()).toEqual({ open: 0, attention: null });

  await updateContractingSettings({
    db,
    actorUserId: adminId,
    input: { ...(await getContractingSettings({ db })), gapFlagThresholdHours: 2 },
  });
  expect(await detail()).toEqual({ flagged: true, open: 1, threshold: 2 });
  expect(await queue()).toMatchObject({ open: 1 });
  expect((await queue()).attention).not.toBeNull();

  await updateContractingSettings({
    db,
    actorUserId: adminId,
    input: { ...(await getContractingSettings({ db })), gapFlagThresholdHours: 3 },
  });
  // Equal to the threshold is not over it.
  expect(await detail()).toEqual({ flagged: false, open: 0, threshold: 3 });
  expect(await queue()).toEqual({ open: 0, attention: null });
});
