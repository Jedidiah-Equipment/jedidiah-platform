import { auditEvents } from '@pkg/db';
import { contractingJobs } from '@pkg/db/contracting';
import { DateOnlyIso } from '@pkg/schema';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import {
  admin,
  editHours,
  foreman,
  invoicing,
  type JobFixtures,
  pricedJob,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import { findJobsByInvoiceNumber, stampInvoice, summarizeInvoicedByMonth } from './invoicing-service.js';
import { getJob } from './job-read.js';
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

    await stampInvoice({
      db: context.db,
      actor: invoicing,
      input: { id: jobId, invoiceNumber: 'INV-2041', expectedTotal: total },
    });
    const invoiced = await getJob({ db: context.db, id: jobId });

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

  test('refuses a total the user did not see, then stamps the re-priced one', async ({ context }) => {
    const { db } = context;
    const priced = await pricedJob(context, [{ machineId: context.tipper.id, arrival: 100, departure: 110 }]);
    await editHours(db, priced.stints[0]?.id ?? '', { arrival: 101, departure: 110 });
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

describe('invoiced by month', () => {
  const invoicedAt = async (context: JobFixtures, job: { jobId: string; total: number }, at: string) => {
    await stampInvoice({
      db: context.db,
      actor: invoicing,
      input: { id: job.jobId, invoiceNumber: `INV-${at}`, expectedTotal: job.total },
    });
    await context.db
      .update(contractingJobs)
      .set({ invoicedAt: new Date(at) })
      .where(eq(contractingJobs.id, job.jobId));
  };

  test('sums each plant-time month, this month to date first, and shows an empty month as zero', async ({
    context,
  }) => {
    const first = await pricedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    const second = await pricedJob(context, [{ machineId: context.tipper.id, arrival: 100, departure: 104 }]);
    const third = await pricedJob(context, [{ machineId: context.excavator.id, arrival: 111, departure: 112 }]);
    const tooOld = await pricedJob(context, [{ machineId: context.tipper.id, arrival: 105, departure: 106 }]);
    // 00:30 SAST on 1 November is still 31 October in UTC.
    await invoicedAt(context, first, '2026-10-31T22:30:00Z');
    await invoicedAt(context, second, '2026-11-02T08:00:00Z');
    await invoicedAt(context, third, '2026-08-01T07:00:00Z');
    await invoicedAt(context, tooOld, '2026-07-31T21:59:00Z');

    const summary = await summarizeInvoicedByMonth({
      db: context.db,
      actor: invoicing,
      today: DateOnlyIso.parse('2026-11-15'),
    });

    expect(summary.months).toEqual([
      { month: '2026-11-01', total: first.total + second.total, jobs: 2 },
      { month: '2026-10-01', total: 0, jobs: 0 },
      { month: '2026-09-01', total: 0, jobs: 0 },
      { month: '2026-08-01', total: third.total, jobs: 1 },
    ]);
  });

  test('never gives a Foreman the figures', async ({ context }) => {
    await expect(summarizeInvoicedByMonth({ db: context.db, actor: foreman })).rejects.toMatchObject({
      code: 'contracting_job.forbidden',
    });
    await expect(summarizeInvoicedByMonth({ db: context.db, actor: admin })).resolves.toMatchObject({
      months: expect.any(Array),
    });
  });
});
