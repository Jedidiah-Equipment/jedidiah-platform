import type { Db } from '@pkg/db';
import { contractingCustomers, contractingJobs } from '@pkg/db/contracting';
import { formatJobNumber, type JobActor, jobTransitions } from '@pkg/domain/contracting';
import type { JobStampInvoiceInput } from '@pkg/schema/contracting';
import { asc, eq, sql } from 'drizzle-orm';
import { totalChanged } from './job-errors.js';
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
