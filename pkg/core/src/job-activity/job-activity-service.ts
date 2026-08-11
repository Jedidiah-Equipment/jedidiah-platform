import { type Db, feedback, getPaginationQueryOptions } from '@pkg/db';
import { getJobDisplayName, resolveJobCustomer, resolveNewestOwnershipTransfer } from '@pkg/domain';
import type { JobActivityItem, JobActivityListInput, JobActivityListResult } from '@pkg/schema';
import { getNextCursor, JobActivityItem as JobActivityItemSchema, JobCode } from '@pkg/schema';
import { and, asc, desc, eq } from 'drizzle-orm';

/**
 * The Job Activity feed reads General Feedback about Jobs and nothing else. Quote general feedback
 * is still private to the `/feedback` inbox and corrective feedback is super-admin-only (ADR 0010),
 * so both are excluded here rather than filtered by caller — the payload never varies by role.
 */
const jobGeneralFeedback = and(eq(feedback.kind, 'general'), eq(feedback.subjectType, 'job'));

const activityReadRelations = {
  job: {
    columns: {
      code: true,
      id: true,
    },
    with: {
      productUnit: {
        columns: { productSerialNumber: true },
        with: {
          // Ownership is the log, not a stored field, so the Owner comes from the newest transfer.
          ownershipTransfers: {
            columns: { createdAt: true, id: true, occurredOn: true, toCustomerId: true },
            with: { toCustomer: { columns: { companyName: true, id: true, thumbnailDataUrl: true } } },
          },
          product: { columns: { name: true } },
        },
      },
      quote: {
        columns: { kind: true, workTitle: true },
        with: { customer: { columns: { companyName: true, id: true, thumbnailDataUrl: true } } },
      },
    },
  },
  submitter: {
    columns: {
      email: true,
      id: true,
      image: true,
      name: true,
    },
  },
} as const;

type JobActivityRow = Awaited<ReturnType<typeof findActivityRows>>[number];

export async function listJobActivity({
  db,
  input,
}: {
  db: Db;
  input: JobActivityListInput;
}): Promise<JobActivityListResult> {
  const total = await db.$count(feedback, jobGeneralFeedback);
  const rows = await findActivityRows(db, input);
  const items = rows.map((row) => mapGeneralFeedbackActivityItem(row));

  return {
    items,
    nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }),
    total,
  };
}

function findActivityRows(db: Db, input: JobActivityListInput) {
  // Tiebreak on id so a row never repeats or vanishes across offset pages when timestamps collide,
  // in the sort's own direction so the one (created_at, id) index serves both — read forward for
  // asc and backward for desc. A mixed pair would order correctly but leave the index behind.
  const direction = input.sortDirection === 'desc' ? desc : asc;

  return db.query.feedback.findMany({
    orderBy: [direction(feedback.createdAt), direction(feedback.id)],
    where: jobGeneralFeedback,
    with: activityReadRelations,
    ...getPaginationQueryOptions(input),
  });
}

function mapGeneralFeedbackActivityItem(row: JobActivityRow): JobActivityItem {
  if (!row.job) {
    throw new Error(`Job general feedback ${row.id} is missing its Job subject`);
  }

  const { job } = row;
  const productName = job.productUnit?.product?.name ?? null;
  // The Unit's current Owner wins over the Customer who bought it, so a transferred machine reads as
  // whoever holds it now; both null means Stock.
  const owner = resolveJobCustomer({
    productUnit: job.productUnit
      ? { owner: resolveNewestOwnershipTransfer(job.productUnit.ownershipTransfers)?.toCustomer ?? null }
      : null,
    quoteCustomer: job.quote?.customer ?? null,
  });

  return JobActivityItemSchema.parse({
    type: 'general-feedback',
    id: row.id,
    occurredAt: row.createdAt.toISOString(),
    job: {
      id: job.id,
      code: JobCode.parse(job.code),
      displayName: getJobDisplayName({
        code: JobCode.parse(job.code),
        productName,
        quoteKind: job.quote?.kind ?? null,
        workTitle: job.quote?.workTitle ?? null,
      }),
      serialNumber: job.productUnit?.productSerialNumber ?? null,
      customerCompanyName: owner?.companyName ?? null,
    },
    feedback: {
      submitter: {
        email: row.submitter.email,
        id: row.submitter.id,
        name: row.submitter.name,
        thumbnailDataUrl: row.submitter.image ?? null,
      },
      text: row.text,
    },
  });
}
