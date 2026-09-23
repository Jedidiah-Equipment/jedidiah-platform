import type { Db } from '@pkg/db';
import { contractingCustomers, contractingJobs } from '@pkg/db/contracting';
import { formatJobNumber } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type { JobStampInvoiceInput } from '@pkg/schema/contracting';
import { asc, eq, sql } from 'drizzle-orm';
import { JobError, withJobConstraints, wrongStatus } from './job-errors.js';
import { writeJob } from './job-write.js';

/** Stamps the accounting system's Invoice Number on a Priced Job, making it Invoiced: the wall. */
export async function stampInvoice({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: JobStampInvoiceInput;
}) {
  return withJobConstraints(() =>
    db.transaction((tx) =>
      writeJob(tx, actorUserId, input.id, {
        assert: (_tx, before) => {
          if (before.status !== 'priced') throw wrongStatus('Only a Priced Job can be invoiced.');
          // The wall is only as good as what it freezes: refuse to stamp a total the user did not see.
          if (before.pricedTotal !== input.expectedTotal)
            throw new JobError(
              'contracting_job.total_changed',
              'This Job was re-priced. Review the new total before stamping.',
            );
        },
        set: () => ({
          status: 'invoiced',
          invoiceNumber: input.invoiceNumber,
          invoicedAt: new Date(),
          invoicedByUserId: actorUserId,
        }),
      }),
    ),
  );
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
