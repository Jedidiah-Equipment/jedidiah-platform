import { auditEvents, type Db, feedback, jobs, user, withPagination } from '@pkg/db';
import { getJobDisplayName, getJobOfferingKind, resolveJobCustomer, resolveNewestOwnershipTransfer } from '@pkg/domain';
import type {
  AuditChanges,
  JobActivityItem,
  JobActivityJobRef,
  JobActivityListInput,
  JobActivityListResult,
} from '@pkg/schema';
import {
  getNextCursor,
  JobActivityItem as JobActivityItemSchema,
  JobActivityJobRef as JobActivityJobRefSchema,
  JobCode,
} from '@pkg/schema';
import { and, asc, desc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';

/**
 * The said half of the feed. Quote general feedback is still private to the `/feedback` inbox and
 * corrective feedback is super-admin-only (ADR 0010), so both are excluded here rather than filtered
 * by caller — the payload never varies by role.
 */
const jobGeneralFeedback = and(eq(feedback.kind, 'general'), eq(feedback.subjectType, 'job'));

/**
 * The done half: the audit rows this feed curates into change events (ADR 0015). Written nowhere but
 * here — an audit row that no predicate selects is simply not part of a Job's public story.
 *
 * Job cancellation is deliberately absent: both cancel paths record `deleted`, which no predicate
 * matches. A cleared `completedOn` is absent for the same reason — un-completing is a correction, not
 * an event, so only a completion date being set reads as one.
 */
const jobChangeEvents = or(
  and(eq(auditEvents.entityType, 'job'), eq(auditEvents.action, 'created')),
  and(eq(auditEvents.entityType, 'job'), eq(auditEvents.action, 'updated'), changeTouches('description')),
  and(eq(auditEvents.entityType, 'job'), eq(auditEvents.action, 'updated'), changeSetTo('completedOn')),
  // The owning Job is read out of the snapshot rather than joined to `documents`, because documents
  // are hard-deleted: a join would erase the "added" entry from history the moment the file goes.
  and(eq(auditEvents.entityType, 'document'), eq(auditEvents.action, 'created'), changeSetTo('jobId')),
) as SQL;

function changeTouches(field: string): SQL {
  return sql`jsonb_exists(${auditEvents.changes}, ${field})`;
}

function changeSetTo(field: string): SQL {
  return sql`${auditEvents.changes} -> ${field} ->> 'to' is not null`;
}

/** The Job facts every item carries, read the same way whichever source the item came from. */
const jobActivityJobRead = {
  columns: {
    code: true,
    id: true,
  },
  with: {
    productUnit: {
      columns: {},
      with: {
        // Ownership is the log, not a stored field, so the Owner comes from the newest transfer.
        ownershipTransfers: {
          columns: { createdAt: true, id: true, occurredOn: true, toCustomerId: true },
          with: { toCustomer: { columns: { companyName: true, id: true, thumbnailDataUrl: true } } },
        },
        product: { columns: { name: true, thumbnailDataUrl: true } },
      },
    },
    quote: {
      columns: { kind: true, workTitle: true },
      with: { customer: { columns: { companyName: true, id: true, thumbnailDataUrl: true } } },
    },
  },
} as const;

const feedbackReadRelations = {
  job: jobActivityJobRead,
  submitter: {
    columns: {
      email: true,
      id: true,
      image: true,
      name: true,
    },
  },
} as const;

type ActivitySource = 'audit' | 'feedback';
type ActivityKey = { id: string; source: ActivitySource };
type FeedbackActivityRow = Awaited<ReturnType<typeof findFeedbackRows>>[number];
type AuditActivityRow = Awaited<ReturnType<typeof findAuditRows>>[number];
type JobActivityJobRow = Awaited<ReturnType<typeof findActivityJobs>>[number];

export async function listJobActivity({
  db,
  input,
}: {
  db: Db;
  input: JobActivityListInput;
}): Promise<JobActivityListResult> {
  const [feedbackTotal, auditTotal, keys] = await Promise.all([
    db.$count(feedback, jobGeneralFeedback),
    db.$count(auditEvents, jobChangeEvents),
    findActivityKeys(db, input),
  ]);
  const total = feedbackTotal + auditTotal;
  const items = await hydrateActivityKeys(db, keys);

  return {
    items,
    nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }),
    total,
  };
}

/**
 * The page of the merged stream, as ids only. Paging the union rather than each source keeps the
 * offset cursor of #980 intact across two tables: one ordered set, one offset into it, so the feed's
 * Load more behaves exactly as it did when feedback was the only source.
 */
async function findActivityKeys(db: Db, input: JobActivityListInput): Promise<ActivityKey[]> {
  const keys = unionAll(
    db
      .select({
        id: feedback.id,
        occurredAt: sql`${feedback.createdAt}`.as('occurred_at'),
        source: sql<ActivitySource>`'feedback'::text`.as('source'),
      })
      .from(feedback)
      .where(jobGeneralFeedback),
    db
      .select({
        id: auditEvents.id,
        occurredAt: sql`${auditEvents.occurredAt}`.as('occurred_at'),
        source: sql<ActivitySource>`'audit'::text`.as('source'),
      })
      .from(auditEvents)
      .where(jobChangeEvents),
  ).as('job_activity_keys');

  // Tiebreak on id so a row never repeats or vanishes across offset pages when timestamps collide,
  // in the sort's own direction. Two events written in the same transaction — a Job created with a
  // description, a document snapshotted onto it — share an instant often enough for this to matter.
  const direction = input.sortDirection === 'desc' ? desc : asc;

  return withPagination(
    db
      .select({ id: keys.id, source: keys.source })
      .from(keys)
      .orderBy(direction(keys.occurredAt), direction(keys.id))
      .$dynamic(),
    input,
  );
}

/** Reads both sources for the page, then reassembles them in the merged order the keys fixed. */
async function hydrateActivityKeys(db: Db, keys: ActivityKey[]): Promise<JobActivityItem[]> {
  const feedbackIds = keys.flatMap((key) => (key.source === 'feedback' ? [key.id] : []));
  const auditIds = keys.flatMap((key) => (key.source === 'audit' ? [key.id] : []));
  const [feedbackRows, auditRows] = await Promise.all([findFeedbackRows(db, feedbackIds), findAuditRows(db, auditIds)]);
  const auditJobs = await findActivityJobs(db, auditRows.map(resolveChangeEventJobId));
  const jobsById = new Map(auditJobs.map((job) => [job.id, job]));
  const feedbackById = new Map(feedbackRows.map((row) => [row.id, row]));
  const auditById = new Map(auditRows.map((row) => [row.id, row]));

  return keys.map((key) => {
    if (key.source === 'feedback') {
      const row = feedbackById.get(key.id);

      if (!row) {
        throw new Error(`Job activity feedback ${key.id} vanished between paging and hydration`);
      }

      return mapGeneralFeedbackActivityItem(row);
    }

    const row = auditById.get(key.id);

    if (!row) {
      throw new Error(`Job activity change event ${key.id} vanished between paging and hydration`);
    }

    const jobId = resolveChangeEventJobId(row);
    const job = jobsById.get(jobId);

    if (!job) {
      throw new Error(`Job activity change event ${row.id} names a Job ${jobId} that does not exist`);
    }

    return mapJobChangeActivityItem(row, mapJobActivityJobRef(job));
  });
}

function findFeedbackRows(db: Db, ids: string[]) {
  return ids.length === 0
    ? Promise.resolve([])
    : db.query.feedback.findMany({ where: inArray(feedback.id, ids), with: feedbackReadRelations });
}

function findAuditRows(db: Db, ids: string[]) {
  return ids.length === 0
    ? Promise.resolve([])
    : db
        .select({
          action: auditEvents.action,
          actorEmail: user.email,
          actorId: user.id,
          actorImage: user.image,
          actorName: user.name,
          changes: auditEvents.changes,
          entityId: auditEvents.entityId,
          entityType: auditEvents.entityType,
          id: auditEvents.id,
          occurredAt: auditEvents.occurredAt,
        })
        .from(auditEvents)
        // Left, because the actor FK clears on user deletion: the event outlives the person.
        .leftJoin(user, eq(auditEvents.actorUserId, user.id))
        .where(inArray(auditEvents.id, ids));
}

function findActivityJobs(db: Db, jobIds: string[]) {
  const ids = [...new Set(jobIds)];

  return ids.length === 0
    ? Promise.resolve([])
    : db.query.jobs.findMany({ where: inArray(jobs.id, ids), ...jobActivityJobRead });
}

/**
 * A Job event is keyed to the Job; a document event carries the Job it was added to inside its
 * creation snapshot, which is `entity_id`'s document rather than the Job.
 */
function resolveChangeEventJobId(row: AuditActivityRow): string {
  if (row.entityType !== 'document') {
    return row.entityId;
  }

  const jobId = readChangeTo(row.changes, 'jobId');

  if (typeof jobId !== 'string') {
    throw new Error(`Document audit event ${row.id} was selected for the Job feed without a Job`);
  }

  return jobId;
}

function mapJobChangeActivityItem(row: AuditActivityRow, job: JobActivityJobRef): JobActivityItem {
  const shared = {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    job,
    actor: mapChangeEventActor(row),
  };

  if (row.entityType === 'document') {
    return JobActivityItemSchema.parse({
      ...shared,
      type: 'job-document-added',
      document: {
        contentType: readChangeTo(row.changes, 'contentType'),
        filename: readChangeTo(row.changes, 'filename'),
      },
    });
  }

  if (row.action === 'created') {
    return JobActivityItemSchema.parse({ ...shared, type: 'job-created' });
  }

  // Completion wins when one patch both completed the Job and reworded it: the row renders once, and
  // finishing the machine is the larger of the two facts.
  const completedOn = readChangeTo(row.changes, 'completedOn');

  if (completedOn != null) {
    return JobActivityItemSchema.parse({ ...shared, type: 'job-completed', completedOn });
  }

  return JobActivityItemSchema.parse({
    ...shared,
    type: 'job-description-updated',
    description: readChangeTo(row.changes, 'description'),
  });
}

function mapChangeEventActor(row: AuditActivityRow) {
  return row.actorId === null || row.actorEmail === null || row.actorName === null
    ? null
    : {
        email: row.actorEmail,
        id: row.actorId,
        name: row.actorName,
        thumbnailDataUrl: row.actorImage ?? null,
      };
}

function readChangeTo(changes: unknown, field: string): unknown {
  return (changes as AuditChanges | null)?.[field]?.to ?? null;
}

function mapJobActivityJobRef(job: JobActivityJobRow): JobActivityJobRef {
  const code = JobCode.parse(job.code);
  const productName = job.productUnit?.product?.name ?? null;
  // The Unit's current Owner wins over the Customer who bought it, so a transferred machine reads as
  // whoever holds it now; both null means Stock.
  const owner = resolveJobCustomer({
    productUnit: job.productUnit
      ? { owner: resolveNewestOwnershipTransfer(job.productUnit.ownershipTransfers)?.toCustomer ?? null }
      : null,
    quoteCustomer: job.quote?.customer ?? null,
  });

  return JobActivityJobRefSchema.parse({
    id: job.id,
    code,
    displayName: getJobDisplayName({
      code,
      productName,
      quoteKind: job.quote?.kind ?? null,
      workTitle: job.quote?.workTitle ?? null,
    }),
    offeringKind: getJobOfferingKind({ quoteKind: job.quote?.kind ?? null }),
    thumbnailDataUrl: job.productUnit?.product?.thumbnailDataUrl ?? null,
    customerCompanyName: owner?.companyName ?? null,
  });
}

function mapGeneralFeedbackActivityItem(row: FeedbackActivityRow): JobActivityItem {
  if (!row.job) {
    throw new Error(`Job general feedback ${row.id} is missing its Job subject`);
  }

  return JobActivityItemSchema.parse({
    type: 'general-feedback',
    id: row.id,
    occurredAt: row.createdAt.toISOString(),
    job: mapJobActivityJobRef(row.job),
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
