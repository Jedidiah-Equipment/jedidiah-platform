import { randomUUID } from 'node:crypto';
import { DateOnlyIso } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { amendReading, captureReading } from '../readings/reading-service.js';
import { admin, completedJob, foreman, invoicing, type JobFixtures, seedJobFixtures } from '../test/job-fixtures.js';
import { createAssignment, patchAssignment, removeAssignment, resolveGap } from './assignment-service.js';
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

// The Invoiced wall's twin: a Cancelled Job is closed too, so every write refuses and nothing moves.
test('a Cancelled Job refuses every write, and nothing about it moves', async ({ context }) => {
  const { db } = context;
  const earlier = await completedJob(context, [{ machineId: context.excavator.id, arrival: 90, departure: 98 }]);
  const { jobId, stints } = await completedJob(context, [
    { machineId: context.excavator.id, arrival: 100, departure: 110 },
  ]);
  const stint = stints[0];
  const earlierStint = earlier.stints[0];
  if (!stint || !earlierStint) throw new Error('Expected stints');
  const line = await createChargeLine({ db, actor: admin, input: { jobId, description: 'Low-bed' } });
  await setMeasure({
    db,
    actor: admin,
    input: { assignmentId: stint.id, measureTypeId: context.loads.id, quantity: 12 },
  });
  await cancelJob({ db, actor: admin, input: { id: jobId, reason: 'Customer withdrew' } });
  const frozen = await getJob({ db, id: jobId });

  const jobWrites = {
    'patchJob description': () => patchJob({ db, actor: admin, input: { id: jobId, description: 'Changed' } }),
    'patchJob notes': () => patchJob({ db, actor: admin, input: { id: jobId, notes: 'Paid on site' } }),
    'patchJob diesel': () => patchJob({ db, actor: admin, input: { id: jobId, dieselLitres: 10 } }),
    'patchAssignment travel': () =>
      patchAssignment({ db, actor: admin, input: { id: stint.id, travelIncluded: false } }),
    planAssignment: () =>
      createAssignment({ db, actor: admin, input: { jobId, machineId: context.tipper.id, implementId: null } }),
    addAssignment: () =>
      createAssignment({ db, actor: foreman, input: { jobId, machineId: context.tipper.id, implementId: null } }),
    removeAssignment: () => removeAssignment({ db, actor: admin, id: stint.id }),
    setMeasure: () =>
      setMeasure({
        db,
        actor: admin,
        input: { assignmentId: stint.id, measureTypeId: context.loads.id, quantity: 14 },
      }),
    removeMeasure: () =>
      removeMeasure({ db, actor: admin, input: { assignmentId: stint.id, measureTypeId: context.loads.id } }),
    createChargeLine: () => createChargeLine({ db, actor: admin, input: { jobId, description: 'Extra' } }),
    patchChargeLine: () => patchChargeLine({ db, actor: admin, input: { id: line.id, description: 'Changed' } }),
    removeChargeLine: () => removeChargeLine({ db, actor: admin, id: line.id }),
    resolveGap: () =>
      resolveGap({
        db,
        actor: admin,
        input: { id: stint.id, travelHours: 1, unaccountedHours: 1, reason: 'Refuelled' },
      }),
    setStintRate: () =>
      setStintRate({ db, actor: admin, input: { assignmentId: stint.id, rateId: context.dryHire.id } }),
    clearStintRate: () => clearStintRate({ db, actor: admin, input: { assignmentId: stint.id } }),
    setStintAmount: () => setStintAmount({ db, actor: admin, input: { assignmentId: stint.id, finalAmount: 5_000 } }),
    setDieselPrice: () => setDieselPrice({ db, actor: admin, input: { jobId, unitPrice: 20 } }),
    setDiscount: () => setDiscount({ db, actor: admin, input: { jobId, discount: null } }),
    markPriced: () => markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: 0 } }),
    cancelJob: () => cancelJob({ db, actor: admin, input: { id: jobId, reason: 'Again' } }),
    stampInvoice: () =>
      stampInvoice({ db, actor: invoicing, input: { id: jobId, invoiceNumber: 'INV-901', expectedTotal: 0 } }),
    completeJob: () =>
      completeJob({
        db,
        actor: admin,
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

  await expect(
    captureReading({
      db,
      actor: foreman,
      input: {
        machineId: context.tipper.id,
        role: 'arrival',
        value: 50,
        capturedAt: '2026-09-20T08:00:00+02:00',
        disputePrevious: false,
        startAssignment: { jobId, localId: randomUUID(), implementId: null },
      },
    }),
    'a phone starting a stint',
  ).rejects.toMatchObject({ code: 'reading.wrong_status' });

  const readingAmendments = {
    'its arrival': { id: stint.arrivalReadingId, value: 101 },
    'its departure': { id: stint.departureReadingId, value: 109 },
    'the departure its first stint’s Hour Gap starts at': { id: earlierStint.departureReadingId, value: 97 },
  };
  for (const [name, amendment] of Object.entries(readingAmendments))
    await expect(
      amendReading({ db, actor: admin, input: { ...amendment, reason: 'Misread' } }),
      name,
    ).rejects.toMatchObject({ code: 'reading.wrong_status' });

  expect(await getJob({ db, id: jobId })).toEqual(frozen);
});
