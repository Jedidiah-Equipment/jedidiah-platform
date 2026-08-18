import {
  auditEvents,
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  currentOwnerCustomerId,
  customers,
  type Db,
  feedback,
  jobs,
  products,
  productUnits,
  quotes,
  user,
  withPagination,
} from '@pkg/db';
import {
  getJobDisplayName,
  getJobOfferingKind,
  JOB_ACTIVITY_EVENT_SENTENCES,
  resolveJobCustomer,
  resolveNewestOwnershipTransfer,
} from '@pkg/domain';
import type {
  AuditChanges,
  JobActivityItem,
  JobActivityJobRef,
  JobActivityListInput,
  JobActivityListResult,
} from '@pkg/schema';
import {
  DateIso,
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

export async function getLastActivitySeen({ db, userId }: { db: Db; userId: string }) {
  const [account] = await db.select({ lastActivitySeen: user.lastActivitySeen }).from(user).where(eq(user.id, userId));

  if (!account) throw new Error(`User ${userId} does not exist`);

  return DateIso.parse(account.lastActivitySeen);
}

/** Advances the signed-in user's Activity high-water mark using server time, never a client clock. */
export async function setLastActivitySeen({
  db,
  userId,
  seenAt = new Date(),
}: {
  db: Db;
  userId: string;
  seenAt?: Date;
}) {
  const [account] = await db
    .update(user)
    .set({ lastActivitySeen: sql`greatest(${user.lastActivitySeen}, ${seenAt.toISOString()}::timestamptz)` })
    .where(eq(user.id, userId))
    .returning({ lastActivitySeen: user.lastActivitySeen });

  if (!account) throw new Error(`User ${userId} does not exist`);

  return DateIso.parse(account.lastActivitySeen);
}

/**
 * The done half: the audit rows this feed curates into change events (ADR 0015). Written nowhere but
 * here — an audit row that no predicate selects is simply not part of a Job's public story.
 *
 * Job cancellation is deliberately absent: both cancel paths record `deleted`, which no predicate
 * matches. A cleared `completedOn` is absent for the same reason — un-completing is a correction, not
 * an event, so only a completion date being set reads as one.
 */
const jobCreatedEvent = and(eq(auditEvents.entityType, 'job'), eq(auditEvents.action, 'created')) as SQL;
const jobDescriptionUpdatedEvent = and(
  eq(auditEvents.entityType, 'job'),
  eq(auditEvents.action, 'updated'),
  changeSetNames('description'),
) as SQL;
const jobCompletedEvent = and(
  eq(auditEvents.entityType, 'job'),
  eq(auditEvents.action, 'updated'),
  changedFieldIsSet('completedOn'),
) as SQL;
const jobDocumentAddedEvent = and(
  // The owning Job is read out of the snapshot rather than joined to `documents`, because documents
  // are hard-deleted: a join would erase the "added" entry from history the moment the file goes.
  eq(auditEvents.entityType, 'document'),
  eq(auditEvents.action, 'created'),
  changedFieldIsSet('jobId'),
  // Creating a Job generates its own Brochure through the same audited path, and nobody added
  // that: without this every Job would report a file beside its own `job-created` entry.
  changedFieldIsNot('metadata', 'type', 'brochure'),
) as SQL;
const jobDescriptionOnlyEvent = and(jobDescriptionUpdatedEvent, sql`not (${changedFieldIsSet('completedOn')})`) as SQL;
const jobChangeEvents = or(
  jobCreatedEvent,
  jobDescriptionUpdatedEvent,
  jobCompletedEvent,
  jobDocumentAddedEvent,
) as SQL;

function changeSetNames(field: string): SQL {
  return sql`jsonb_exists(${auditEvents.changes}, ${field})`;
}

/** `is distinct from`, so a row whose field or nested key is absent stays in rather than dropping out. */
function changedFieldIsNot(field: string, key: string, value: string): SQL {
  return sql`${auditEvents.changes} -> ${field} -> 'to' ->> ${key} is distinct from ${value}`;
}

function changedFieldIsSet(field: string): SQL {
  return sql`${auditEvents.changes} -> ${field} ->> 'to' is not null`;
}

function jobGeneralFeedbackFilter(input: JobActivityListInput): SQL {
  return and(
    jobGeneralFeedback,
    input.jobId ? eq(feedback.jobId, input.jobId) : undefined,
    input.search ? jobGeneralFeedbackSearch(input.search) : undefined,
  ) as SQL;
}

function jobChangeEventFilter(input: JobActivityListInput): SQL {
  return and(
    jobChangeEvents,
    input.jobId
      ? or(
          and(eq(auditEvents.entityType, 'job'), eq(auditEvents.entityId, input.jobId)),
          and(eq(auditEvents.entityType, 'document'), sql`${auditEvents.changes} -> 'jobId' ->> 'to' = ${input.jobId}`),
        )
      : undefined,
    input.search ? jobChangeEventSearch(input.search) : undefined,
  ) as SQL;
}

function jobGeneralFeedbackSearch(search: string): SQL {
  return or(
    createEscapedContainsSearchCondition(sql`${feedback.text}`, search),
    sql`exists (
      select 1
      from ${user}
      where ${user.id} = ${feedback.submitterId}
        and ${createEscapedContainsSearchCondition(sql`${user.name}`, search)}
    )`,
    jobActivityJobSearch(sql`${feedback.jobId}::text`, search),
  ) as SQL;
}

function jobChangeEventSearch(search: string): SQL {
  const displayedSystemMatches = visibleTextMatches('System', search);

  return or(
    and(
      jobDescriptionOnlyEvent,
      createEscapedContainsSearchCondition(sql`${auditEvents.changes} -> 'description' ->> 'to'`, search),
    ),
    and(
      jobDocumentAddedEvent,
      createEscapedContainsSearchCondition(sql`${auditEvents.changes} -> 'filename' ->> 'to'`, search),
    ),
    sql`exists (
      select 1
      from ${user}
      where ${user.id} = ${auditEvents.actorUserId}
        and ${createEscapedContainsSearchCondition(sql`${user.name}`, search)}
    )`,
    displayedSystemMatches ? sql`${auditEvents.actorUserId} is null` : undefined,
    jobChangeEventSentenceSearch(search),
    jobActivityJobSearch(changeEventJobIdExpression, search),
  ) as SQL;
}

function jobChangeEventSentenceSearch(search: string): SQL | undefined {
  return or(
    visibleTextMatches(JOB_ACTIVITY_EVENT_SENTENCES.created, search) ? jobCreatedEvent : undefined,
    visibleTextMatches(JOB_ACTIVITY_EVENT_SENTENCES.descriptionChanged, search)
      ? and(jobDescriptionOnlyEvent, changedFieldIsSet('description'))
      : undefined,
    visibleTextMatches(JOB_ACTIVITY_EVENT_SENTENCES.descriptionCleared, search)
      ? and(jobDescriptionOnlyEvent, sql`${auditEvents.changes} -> 'description' ->> 'to' is null`)
      : undefined,
    visibleTextMatches(JOB_ACTIVITY_EVENT_SENTENCES.completed, search) ? jobCompletedEvent : undefined,
    visibleTextMatches(JOB_ACTIVITY_EVENT_SENTENCES.documentAdded, search) ? jobDocumentAddedEvent : undefined,
  );
}

function visibleTextMatches(text: string, search: string): boolean {
  return text.toLowerCase().includes(search.toLowerCase());
}

/** The owning Job is direct on Job events and embedded in the curated snapshot for documents. */
const changeEventJobIdExpression = sql<string>`case
  when ${auditEvents.entityType} = 'document' then ${auditEvents.changes} -> 'jobId' ->> 'to'
  else ${auditEvents.entityId}
end`;

/**
 * Matches only facts the feed displays. The correlated subquery keeps ownership history from
 * multiplying Activity rows, which would corrupt the merged stream's totals and offset cursor.
 */
function jobActivityJobSearch(jobIdExpression: SQL, search: string): SQL {
  const currentCustomerId = sql<string | null>`case
    when ${jobs.productUnitId} is null then ${quotes.customerId}
    else ${currentOwnerCustomerId(jobs.productUnitId)}
  end`;
  const displayedStockMatches = visibleTextMatches('Stock', search);
  const visibleJobFields = createGlobalSearchCondition(search, [
    sql`concat('JOB-', lpad(${jobs.code}::text, 5, '0'))`,
    sql`${products.name}`,
    sql`${quotes.workTitle}`,
    sql`${customers.companyName}`,
  ]);

  return sql`exists (
    select 1
    from ${jobs}
    left join ${productUnits} on ${productUnits.id} = ${jobs.productUnitId}
    left join ${products} on ${products.id} = ${productUnits.productId}
    left join ${quotes} on ${quotes.id} = ${jobs.quoteId}
    left join ${customers} on ${customers.id} = ${currentCustomerId}
    where ${jobs.id}::text = ${jobIdExpression}
      and ${or(visibleJobFields, displayedStockMatches ? sql`${currentCustomerId} is null` : undefined)}
  )`;
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
  const includeFeedback = input.filter !== 'job-events';
  const includeJobEvents = input.filter !== 'user-feedback';
  const [feedbackTotal, auditTotal, keys] = await Promise.all([
    includeFeedback ? db.$count(feedback, jobGeneralFeedbackFilter(input)) : Promise.resolve(0),
    includeJobEvents ? db.$count(auditEvents, jobChangeEventFilter(input)) : Promise.resolve(0),
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
  const includeFeedback = input.filter !== 'job-events';
  const includeJobEvents = input.filter !== 'user-feedback';
  const keys = unionAll(
    db
      .select({
        id: feedback.id,
        occurredAt: sql`${feedback.createdAt}`.as('occurred_at'),
        source: sql<ActivitySource>`'feedback'::text`.as('source'),
      })
      .from(feedback)
      .where(includeFeedback ? jobGeneralFeedbackFilter(input) : sql`false`),
    db
      .select({
        id: auditEvents.id,
        occurredAt: sql`${auditEvents.occurredAt}`.as('occurred_at'),
        source: sql<ActivitySource>`'audit'::text`.as('source'),
      })
      .from(auditEvents)
      .where(includeJobEvents ? jobChangeEventFilter(input) : sql`false`),
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

  // Guarded rather than a fallthrough: a `description` this mapper never saw means a predicate above
  // now selects a row no branch here claims, and the next one is `job-cancelled`. Failing loudly
  // beats labelling a cancellation as a description someone cleared.
  if (!changeSetNamesField(row.changes, 'description')) {
    throw new Error(`Job activity change event ${row.id} matched a predicate no activity type maps`);
  }

  return JobActivityItemSchema.parse({
    ...shared,
    type: 'job-description-updated',
    description: readChangeTo(row.changes, 'description'),
  });
}

function changeSetNamesField(changes: unknown, field: string): boolean {
  return field in ((changes as AuditChanges | null) ?? {});
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
