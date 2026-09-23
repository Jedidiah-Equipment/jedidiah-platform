import { DateOnlyIso } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { amendReading } from '../readings/reading-service.js';
import {
  adminId,
  completedJob,
  foremanId,
  invoicingId,
  type JobFixtures,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import { addAssignment, patchAssignment, planAssignment, removeAssignment, resolveGap } from './assignment-service.js';
import { createChargeLine, patchChargeLine, removeChargeLine } from './charge-line-service.js';
import { stampInvoice } from './invoicing-service.js';
import { getJob } from './job-read.js';
import { cancelJob, completeJob, patchJob } from './job-service.js';
import { removeMeasure, setMeasure } from './measure-service.js';
import {
  clearStintRate,
  markPriced,
  setDieselPrice,
  setDiscount,
  setStintAmount,
  setStintRate,
} from './pricing-service.js';

const test = createTester(async ({ db }) => ({ ...(await seedJobFixtures(db)), db }) satisfies JobFixtures);

// If a future write forgets the wall, this is the file where it fails: add every new Job write here.
test('an Invoiced Job refuses every write, and nothing about it moves', async ({ context }) => {
  const { db } = context;
  const earlier = await completedJob(context, [{ machineId: context.excavator.id, arrival: 90, departure: 98 }]);
  const { jobId, stints } = await completedJob(context, [
    { machineId: context.excavator.id, arrival: 100, departure: 110 },
  ]);
  const stint = stints[0];
  const earlierStint = earlier.stints[0];
  if (!stint || !earlierStint) throw new Error('Expected stints');
  const line = await createChargeLine({ db, actorUserId: adminId, input: { jobId, description: 'Low-bed' } });
  if (!line) throw new Error('Expected a charge line');
  await patchChargeLine({ db, actorUserId: adminId, input: { id: line.id, amount: 1_500 }, canPrice: true });
  await setMeasure({
    db,
    actorUserId: adminId,
    input: { assignmentId: stint.id, measureTypeId: context.loads.id, quantity: 12 },
  });
  await setStintRate({ db, actorUserId: adminId, input: { assignmentId: stint.id, rateId: context.dryHire.id } });
  const total = (await getJob({ db, id: jobId })).pricing?.total ?? 0;
  await markPriced({ db, actorUserId: adminId, input: { id: jobId, expectedTotal: total } });
  await stampInvoice({
    db,
    actorUserId: invoicingId,
    input: { id: jobId, invoiceNumber: 'INV-900', expectedTotal: total },
  });
  const frozen = await getJob({ db, id: jobId });

  const jobWrites = {
    'patchJob description': () => patchJob({ db, actorUserId: adminId, input: { id: jobId, description: 'Changed' } }),
    'patchJob notes': () => patchJob({ db, actorUserId: adminId, input: { id: jobId, notes: 'Paid on site' } }),
    'patchJob dates': () =>
      patchJob({ db, actorUserId: adminId, input: { id: jobId, startDate: DateOnlyIso.parse('2026-09-02') } }),
    'patchJob diesel': () => patchJob({ db, actorUserId: adminId, input: { id: jobId, dieselLitres: 10 } }),
    'patchJob foreman': () => patchJob({ db, actorUserId: adminId, input: { id: jobId, foremanUserId: null } }),
    'patchAssignment travel': () =>
      patchAssignment({ db, actorUserId: adminId, input: { id: stint.id, travelIncluded: false } }),
    'patchAssignment implement': () =>
      patchAssignment({ db, actorUserId: adminId, input: { id: stint.id, implementId: null } }),
    planAssignment: () =>
      planAssignment({ db, actorUserId: adminId, input: { jobId, machineId: context.tipper.id, implementId: null } }),
    addAssignment: () =>
      addAssignment({ db, actorUserId: foremanId, input: { jobId, machineId: context.tipper.id, implementId: null } }),
    removeAssignment: () => removeAssignment({ db, actorUserId: adminId, id: stint.id }),
    setMeasure: () =>
      setMeasure({
        db,
        actorUserId: adminId,
        input: { assignmentId: stint.id, measureTypeId: context.loads.id, quantity: 14 },
      }),
    removeMeasure: () =>
      removeMeasure({ db, actorUserId: adminId, input: { assignmentId: stint.id, measureTypeId: context.loads.id } }),
    createChargeLine: () => createChargeLine({ db, actorUserId: adminId, input: { jobId, description: 'Extra' } }),
    patchChargeLine: () =>
      patchChargeLine({ db, actorUserId: adminId, input: { id: line.id, amount: 1_000 }, canPrice: true }),
    removeChargeLine: () => removeChargeLine({ db, actorUserId: adminId, id: line.id }),
    resolveGap: () =>
      resolveGap({
        db,
        actorUserId: adminId,
        input: { id: stint.id, travelHours: 1, unaccountedHours: 1, reason: 'Refuelled' },
      }),
    setStintRate: () =>
      setStintRate({ db, actorUserId: adminId, input: { assignmentId: stint.id, rateId: context.dryHire.id } }),
    clearStintRate: () => clearStintRate({ db, actorUserId: adminId, input: { assignmentId: stint.id } }),
    setStintAmount: () =>
      setStintAmount({ db, actorUserId: adminId, input: { assignmentId: stint.id, finalAmount: 5_000 } }),
    setDieselPrice: () => setDieselPrice({ db, actorUserId: adminId, input: { jobId, unitPrice: 20 } }),
    setDiscount: () => setDiscount({ db, actorUserId: adminId, input: { jobId, discount: null } }),
    markPriced: () => markPriced({ db, actorUserId: adminId, input: { id: jobId, expectedTotal: total } }),
    cancelJob: () => cancelJob({ db, actorUserId: adminId, input: { id: jobId, reason: 'Customer disputed' } }),
    stampInvoice: () =>
      stampInvoice({
        db,
        actorUserId: invoicingId,
        input: { id: jobId, invoiceNumber: 'INV-901', expectedTotal: total },
      }),
    completeJob: () =>
      completeJob({
        db,
        actorUserId: adminId,
        input: {
          id: jobId,
          startDate: DateOnlyIso.parse('2026-09-01'),
          endDate: DateOnlyIso.parse('2026-09-10'),
          dieselLitres: 0,
          notes: null,
          removePlannedAssignmentIds: [],
        },
      }),
  };
  for (const [name, write] of Object.entries(jobWrites))
    await expect(write(), name).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });

  const readingAmendments = {
    'its arrival': { id: stint.arrivalReadingId, value: 101 },
    'its departure': { id: stint.departureReadingId, value: 109 },
    'the departure its first stint’s Hour Gap starts at': { id: earlierStint.departureReadingId, value: 97 },
  };
  for (const [name, amendment] of Object.entries(readingAmendments))
    await expect(
      amendReading({ db, actorUserId: adminId, input: { ...amendment, reason: 'Misread' } }),
      name,
    ).rejects.toMatchObject({ code: 'reading.job_invoiced' });

  expect(await getJob({ db, id: jobId })).toEqual(frozen);
});
