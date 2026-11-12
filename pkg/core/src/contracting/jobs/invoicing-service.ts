import { calendarMonthOf, type Db } from '@pkg/db';
import { contractingCustomers, contractingJobs } from '@pkg/db/contracting';
import { getPlantDateNow, invoicedMonthsWindow, JOHANNESBURG_TIME_ZONE } from '@pkg/domain';
import { formatJobNumber, type JobActor, jobTransitions, readsJobMoney } from '@pkg/domain/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import { InvoicedByMonth, type JobStampInvoiceInput } from '@pkg/schema/contracting';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { JobError, totalChanged } from './job-errors.js';
import { lockJobFor } from './job-lock.js';
import { jobTransaction, writeJobRow } from './job-write.js';

/** Stamps the accounting system's Invoice Number on a Priced Job, making it Invoiced: the wall. */
export async function stampInvoice({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: JobStampInvoiceInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const before = await lockJobFor(tx, input.id, 'stampInvoice', actor);
    if (before.pricedTotal !== input.expectedTotal)
      throw totalChanged('This Job was re-priced. Review the new total before stamping.');
    await writeJobRow(tx, actor.userId, before.id, (row) =>
      jobTransitions.invoice(row, { at: new Date(), byUserId: actor.userId, invoiceNumber: input.invoiceNumber }),
    );
  });
}

/** Jobs already carrying this number — a hint for the stamp dialog, never a rule. */
export async function findJobsByInvoiceNumber({ db, invoiceNumber }: { db: Db; invoiceNumber: string }) {
  const rows = await db
    .select({ id: contractingJobs.id, code: contractingJobs.code, customerName: contractingCustomers.name })
    .from(contractingJobs)
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .where(sql`lower(${contractingJobs.invoiceNumber}) = lower(${invoiceNumber})`)
    .orderBy(asc(contractingJobs.code));
  return rows.map((row) => ({ ...row, jobNumber: formatJobNumber(row.code) }));
}

/**
 * The priced totals of the Jobs marked as Invoiced in each plant-time month: this month to date first, then the three
 * full months before it. Only someone whose Job read sees money gets the figures.
 */
export async function summarizeInvoicedByMonth({
  db,
  actor,
  today = getPlantDateNow(),
}: {
  db: Db;
  actor: JobActor;
  today?: DateOnlyIso;
}): Promise<InvoicedByMonth> {
  if (!readsJobMoney(actor))
    throw new JobError('contracting_job.forbidden', 'You do not have permission to view invoiced amounts.');
  const { months, from } = invoicedMonthsWindow(today);
  const month = calendarMonthOf(contractingJobs.invoicedAt, JOHANNESBURG_TIME_ZONE);
  const rows = await db
    .select({
      month,
      total: sql<number>`coalesce(sum(${contractingJobs.pricedTotal}), 0)`.mapWith(Number),
      jobs: sql<number>`count(*)::integer`,
    })
    .from(contractingJobs)
    .where(and(eq(contractingJobs.status, 'invoiced'), gte(contractingJobs.invoicedAt, from)))
    // By position: the month expression's time zone is a bound parameter, which Postgres would not match as the same.
    .groupBy(sql`1`);
  const byMonth = new Map(rows.map(({ month, ...figures }) => [month, figures]));
  return InvoicedByMonth.parse({
    months: months.map((first) => ({ month: first, ...(byMonth.get(first) ?? { total: 0, jobs: 0 }) })),
  });
}
