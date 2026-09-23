import { auditEvents } from '@pkg/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { amendReading } from '../readings/reading-service.js';
import { admin, completedJob, invoicing, type JobFixtures, pricedJob, seedJobFixtures } from '../test/job-fixtures.js';
import { findJobsByInvoiceNumber, stampInvoice } from './invoicing-service.js';
import { markPriced } from './pricing-service.js';

const test = createTester(async ({ db }) => ({ ...(await seedJobFixtures(db)), db }) satisfies JobFixtures);

const jobEvents = (context: JobFixtures, jobId: string) =>
  context.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.entityType, 'contracting_job'), eq(auditEvents.entityId, jobId)));

describe('stamping an Invoice Number', () => {
  test('makes a Priced Job Invoiced in one audited write', async ({ context }) => {
    const { jobId, total } = await pricedJob(context, [
      { machineId: context.excavator.id, arrival: 100, departure: 110 },
    ]);
    const eventsBefore = (await jobEvents(context, jobId)).length;

    const invoiced = await stampInvoice({
      db: context.db,
      actor: invoicing,
      input: { id: jobId, invoiceNumber: 'INV-2041', expectedTotal: total },
    });

    expect(invoiced).toMatchObject({
      status: 'invoiced',
      invoiceNumber: 'INV-2041',
      invoicedByName: 'Karen',
      pricedTotal: 6_000,
    });
    expect(invoiced.invoicedAt).not.toBeNull();
    const events = await jobEvents(context, jobId);
    expect(events).toHaveLength(eventsBefore + 1);
    expect(Object.keys((events.at(-1)?.changes ?? {}) as object).sort()).toEqual([
      'invoiceNumber',
      'invoicedAt',
      'invoicedByUserId',
      'status',
    ]);
  });

  test('refuses a Completed Job, a second stamp, and a total the user did not see', async ({ context }) => {
    const { db } = context;
    const completed = await completedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    await expect(
      stampInvoice({
        db,
        actor: invoicing,
        input: { id: completed.jobId, invoiceNumber: 'INV-1', expectedTotal: 0 },
      }),
    ).rejects.toMatchObject({
      code: 'contracting_job.wrong_status',
      message: 'You can only stamp an Invoice Number while the Job is Priced.',
    });

    const priced = await pricedJob(context, [{ machineId: context.tipper.id, arrival: 100, departure: 110 }]);
    await amendReading({
      db,
      actor: admin,
      input: { id: priced.stints[0]?.arrivalReadingId ?? '', value: 101, reason: 'Misread' },
    });
    await markPriced({ db, actor: admin, input: { id: priced.jobId, expectedTotal: 5_400 } });
    await expect(
      stampInvoice({
        db,
        actor: invoicing,
        input: { id: priced.jobId, invoiceNumber: 'INV-2', expectedTotal: priced.total },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.total_changed' });

    await stampInvoice({
      db,
      actor: invoicing,
      input: { id: priced.jobId, invoiceNumber: 'INV-2', expectedTotal: 5_400 },
    });
    await expect(
      stampInvoice({
        db,
        actor: invoicing,
        input: { id: priced.jobId, invoiceNumber: 'INV-3', expectedTotal: 5_400 },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
  });
});

describe('finding Jobs by Invoice Number', () => {
  test('matches regardless of case and only Jobs that carry the number', async ({ context }) => {
    const first = await pricedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    const second = await pricedJob(context, [{ machineId: context.tipper.id, arrival: 100, departure: 104 }]);
    await pricedJob(context, [{ machineId: context.excavator.id, arrival: 111, departure: 112 }]);
    for (const [job, invoiceNumber] of [
      [first, 'inv-77'],
      [second, 'INV-78'],
    ] as const)
      await stampInvoice({
        db: context.db,
        actor: invoicing,
        input: { id: job.jobId, invoiceNumber, expectedTotal: job.total },
      });

    expect(await findJobsByInvoiceNumber({ db: context.db, invoiceNumber: 'INV-77' })).toEqual([
      { id: first.jobId, code: expect.any(Number), jobNumber: first.jobNumber, customerName: 'Rowley' },
    ]);
    expect(await findJobsByInvoiceNumber({ db: context.db, invoiceNumber: 'INV-7' })).toEqual([]);
  });
});
