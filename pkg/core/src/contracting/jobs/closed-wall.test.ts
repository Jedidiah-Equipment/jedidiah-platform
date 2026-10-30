import { DateOnlyIso } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import {
  addedChargeLine,
  admin,
  completedJob,
  foreman,
  invoicing,
  type JobFixtures,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import { createAssignment, patchAssignment, removeAssignment } from './assignment-service.js';
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
import { captureStintHours, editStintHours, setTravelHours } from './stint-hours-service.js';

const test = createTester(async ({ db }) => ({ ...(await seedJobFixtures(db)), db }) satisfies JobFixtures);

// Invoiced and Cancelled are both closed. If a future write forgets the wall, this is the file where it
// fails: add every new Job write here.
test.for(['invoiced', 'cancelled'] as const)(
  'a %s Job refuses every write, and nothing about it moves',
  async (closed, { context }) => {
    const { db } = context;
    const earlier = await completedJob(context, [{ machineId: context.excavator.id, arrival: 90, departure: 98 }]);
    const { jobId, stints } = await completedJob(context, [
      { machineId: context.excavator.id, arrival: 100, departure: 110 },
    ]);
    const stint = stints[0];
    const earlierStint = earlier.stints[0];
    if (!stint || !earlierStint) throw new Error('Expected stints');
    const line = await addedChargeLine(db, admin, { jobId, description: 'Low-bed' });
    await patchChargeLine({ db, actor: admin, input: { id: line.id, amount: 1_500 } });
    await setMeasure({
      db,
      actor: admin,
      input: { assignmentId: stint.id, measureTypeId: context.loads.id, quantity: 12 },
    });
    let total = 0;
    if (closed === 'invoiced') {
      await setStintRate({ db, actor: admin, input: { assignmentId: stint.id, rateId: context.dryHire.id } });
      total = (await getJob({ db, id: jobId })).pricing?.total ?? 0;
      await markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: total } });
      await stampInvoice({
        db,
        actor: invoicing,
        input: { id: jobId, invoiceNumber: 'INV-900', expectedTotal: total },
      });
    } else await cancelJob({ db, actor: admin, input: { id: jobId, reason: 'Customer withdrew' } });
    const frozen = await getJob({ db, id: jobId });

    const jobWrites = {
      'patchJob description': () => patchJob({ db, actor: admin, input: { id: jobId, description: 'Changed' } }),
      'patchJob notes': () => patchJob({ db, actor: admin, input: { id: jobId, notes: 'Paid on site' } }),
      'patchJob dates': () =>
        patchJob({ db, actor: admin, input: { id: jobId, startDate: DateOnlyIso.parse('2026-09-02') } }),
      'patchJob diesel': () => patchJob({ db, actor: admin, input: { id: jobId, dieselLitres: 10 } }),
      'patchJob foreman': () => patchJob({ db, actor: admin, input: { id: jobId, foremanUserId: null } }),
      'patchAssignment implement': () =>
        patchAssignment({ db, actor: admin, input: { id: stint.id, implementId: null } }),
      planAssignment: () =>
        createAssignment({
          db,
          actor: admin,
          input: { jobId, machineId: context.tipper.id, implementId: null },
        }),
      addAssignment: () =>
        createAssignment({
          db,
          actor: foreman,
          input: { jobId, machineId: context.tipper.id, implementId: null },
        }),
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
      patchChargeLine: () => patchChargeLine({ db, actor: admin, input: { id: line.id, amount: 1_000 } }),
      removeChargeLine: () => removeChargeLine({ db, actor: admin, id: line.id }),
      captureDeparture: () =>
        captureStintHours({ db, actor: foreman, input: { assignmentId: stint.id, role: 'departure', hours: 150 } }),
      editStintHours: () =>
        editStintHours({
          db,
          actor: admin,
          input: { assignmentId: stint.id, arrivalHours: 101, departureHours: 109, reason: 'Misread' },
        }),
      setTravelHours: () => setTravelHours({ db, actor: admin, input: { assignmentId: stint.id, travelHours: 1 } }),
      setStintRate: () =>
        setStintRate({ db, actor: admin, input: { assignmentId: stint.id, rateId: context.dryHire.id } }),
      clearStintRate: () => clearStintRate({ db, actor: admin, input: { assignmentId: stint.id } }),
      setStintAmount: () => setStintAmount({ db, actor: admin, input: { assignmentId: stint.id, finalAmount: 5_000 } }),
      setDieselPrice: () => setDieselPrice({ db, actor: admin, input: { jobId, unitPrice: 20 } }),
      setDiscount: () => setDiscount({ db, actor: admin, input: { jobId, discount: null } }),
      markPriced: () => markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: total } }),
      cancelJob: () => cancelJob({ db, actor: admin, input: { id: jobId, reason: 'Customer disputed' } }),
      stampInvoice: () =>
        stampInvoice({
          db,
          actor: invoicing,
          input: { id: jobId, invoiceNumber: 'INV-901', expectedTotal: total },
        }),
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

    // The Machine's earlier Job stays editable, and Travel this stint snapshotted from it does not move.
    await editStintHours({
      db,
      actor: admin,
      input: { assignmentId: earlierStint.id, arrivalHours: 90, departureHours: 97, reason: 'Misread' },
    });

    expect(await getJob({ db, id: jobId })).toEqual(frozen);
  },
);
