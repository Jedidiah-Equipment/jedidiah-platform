import { type Db, user } from '@pkg/db';
import {
  feedback,
  feedbackDepartment,
  feedbackUser,
  jobs,
  purchaseOrderJobLinks,
  purchaseOrders,
  quotes,
} from '@pkg/db/equipment';
import { getJobCodeWithHint } from '@pkg/domain/equipment';
import type { AuthId } from '@pkg/schema';
import type {
  Department,
  FeedbackDetailInput,
  FeedbackListInput,
  FeedbackListResult,
  FeedbackStatus,
  FeedbackSubmitInput,
  FeedbackSubmitResult,
  FeedbackTargetUser as FeedbackTargetUserType,
  FeedbackUpdateInput,
  JobFeedbackListInput,
  JobFeedbackListResult,
  JobFeedbackUpdateInput,
  JobFeedbackUpdateResult,
  PurchaseOrderFeedbackListInput,
  PurchaseOrderFeedbackListResult,
  QuoteKind,
} from '@pkg/schema/equipment';
import {
  FeedbackDetail,
  FeedbackListItem,
  FeedbackSubmitter,
  FeedbackTargetUser,
  FeedbackTargetUserList,
  JobCode,
  JobFeedbackItem,
  PurchaseOrderFeedbackItem,
  QuoteCode,
} from '@pkg/schema/equipment';
import { and, asc, desc, eq, inArray, ne, or } from 'drizzle-orm';

import { feedbackNotFound, feedbackSubjectNotFound } from './feedback-errors.js';
import { feedbackPurchaseOrderRelation, toFeedbackPurchaseOrder } from './feedback-purchase-order.js';

type FeedbackRow = typeof feedback.$inferSelect;
type FeedbackReadRow = FeedbackRow & {
  departments: { department: Department }[];
  job: {
    code: number;
    id: string;
    productUnit: { productSerialNumber: string } | null;
    quote: { kind: QuoteKind; workTitle: string | null } | null;
  } | null;
  quote: { code: number; customer: { companyName: string }; id: string } | null;
  submitter: { email: string; id: string; image: string | null; name: string };
  users: { user: { id: string; image: string | null; name: string } | null; userId: string }[];
};

// There is no `equipment_feedback:create` permission: any authenticated caller may submit. The subject is
// resolved here on the server so feedback always attaches to a real Quote or Job. Corrective targets
// are written to their join tables in the same transaction as the parent row.
export async function submitFeedback({
  db,
  input,
  submitterId,
}: {
  db: Db;
  input: FeedbackSubmitInput;
  submitterId: AuthId;
}): Promise<FeedbackSubmitResult> {
  const { subject } = input;

  if (subject.subjectType === 'quote') {
    const exists = await db.query.quotes.findFirst({ columns: { id: true }, where: eq(quotes.id, subject.quoteId) });

    if (!exists) {
      throw feedbackSubjectNotFound('quote', subject.quoteId);
    }
  } else if (subject.subjectType === 'purchase-order') {
    const exists = await db.query.purchaseOrders.findFirst({
      columns: { id: true },
      where: eq(purchaseOrders.id, subject.purchaseOrderId),
    });
    if (!exists) throw feedbackSubjectNotFound('purchase-order', subject.purchaseOrderId);
  } else {
    const exists = await db.query.jobs.findFirst({ columns: { id: true }, where: eq(jobs.id, subject.jobId) });

    if (!exists) {
      throw feedbackSubjectNotFound('job', subject.jobId);
    }
  }

  const departments = input.kind === 'corrective-feedback-department' ? input.departments : [];
  const userIds = input.kind === 'corrective-feedback-user' ? input.userIds : [];

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(feedback)
      .values({
        jobId: subject.subjectType === 'job' ? subject.jobId : null,
        kind: input.kind,
        purchaseOrderId: subject.subjectType === 'purchase-order' ? subject.purchaseOrderId : null,
        quoteId: subject.subjectType === 'quote' ? subject.quoteId : null,
        subjectType: subject.subjectType,
        submitterId,
        text: input.text,
      })
      .returning({ id: feedback.id });

    if (!row) {
      throw new Error('Feedback insert did not return a row');
    }

    if (departments.length > 0) {
      await tx.insert(feedbackDepartment).values(departments.map((department) => ({ department, feedbackId: row.id })));
    }

    if (userIds.length > 0) {
      await tx.insert(feedbackUser).values(userIds.map((userId) => ({ feedbackId: row.id, userId })));
    }

    return { id: row.id };
  });
}

/**
 * The review inbox holds the feedback nobody else can see. A Job's `general` feedback is public on
 * the Job itself (ADR 0010) and is read and closed there, so listing it here only buries the
 * corrective items this queue exists for. Quote `general` feedback stays: it is still private, and
 * this inbox is the only surface that reads it.
 */
const privateFeedback = or(ne(feedback.kind, 'general'), eq(feedback.subjectType, 'quote'));

export async function listFeedback({ db, input }: { db: Db; input: FeedbackListInput }): Promise<FeedbackListResult> {
  const rows = await db.query.feedback.findMany({
    orderBy: [desc(feedback.createdAt), asc(feedback.id)],
    where: and(privateFeedback, input.status ? eq(feedback.status, input.status) : undefined),
    with: feedbackReadRelations,
  });

  return {
    items: rows.map((row) => mapFeedbackListItem(row)),
  };
}

/** Counts what the inbox lists, so the nav dot never points at a queue that reads as empty. */
export async function countOpenFeedback({ db }: { db: Db }): Promise<number> {
  return db.$count(feedback, and(privateFeedback, eq(feedback.status, 'open')));
}

export async function getFeedback({
  db,
  input,
}: {
  db: Db;
  input: FeedbackDetailInput;
}): Promise<FeedbackDetail | null> {
  const row = await db.query.feedback.findFirst({
    where: and(privateFeedback, eq(feedback.id, input.id)),
    with: feedbackReadRelations,
  });

  return row ? mapFeedbackDetail(row) : null;
}

export async function updateFeedback({
  db,
  input,
}: {
  db: Db;
  input: FeedbackUpdateInput;
}): Promise<FeedbackDetail | null> {
  const values: {
    internalNotes?: string | null;
    status?: FeedbackStatus;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (input.status !== undefined) {
    values.status = input.status;
  }

  if (input.internalNotes !== undefined) {
    values.internalNotes = input.internalNotes;
  }

  const [updated] = await db
    .update(feedback)
    .set(values)
    .where(and(privateFeedback, eq(feedback.id, input.id)))
    .returning({ id: feedback.id });

  if (!updated) {
    throw feedbackNotFound(input.id);
  }

  const detail = await getFeedback({ db, input: { id: input.id } });

  if (!detail) {
    throw feedbackNotFound(input.id);
  }

  return detail;
}

// General feedback on a Job is public to `equipment_job:read` holders (ADR 0010). This read returns only
// `kind: 'general'` rows for every caller — super-admins included — so the payload never varies by
// role; corrective feedback stays on the inbox reads above. Ordered newest-first, matching the Job
// activity feed.
export async function listJobFeedback({
  db,
  input,
}: {
  db: Db;
  input: JobFeedbackListInput;
}): Promise<JobFeedbackListResult> {
  const rows = await db.query.feedback.findMany({
    orderBy: [desc(feedback.createdAt), desc(feedback.id)],
    where: and(
      eq(feedback.kind, 'general'),
      or(
        eq(feedback.jobId, input.jobId),
        inArray(
          feedback.purchaseOrderId,
          db
            .select({ id: purchaseOrderJobLinks.purchaseOrderId })
            .from(purchaseOrderJobLinks)
            .where(eq(purchaseOrderJobLinks.jobId, input.jobId)),
        ),
      ),
    ),
    with: jobFeedbackRelations,
  });

  return { items: rows.map(mapJobFeedbackItem) };
}

// Status-only update for a Job's general feedback, open to `equipment_job:update` holders (ADR 0010). Scoped
// to `kind: 'general'` + job subjects so corrective (or quote) feedback reads as not-found here;
// internal notes are never touched through this path.
export async function updateJobFeedback({
  db,
  input,
}: {
  db: Db;
  input: JobFeedbackUpdateInput;
}): Promise<JobFeedbackUpdateResult> {
  const [updated] = await db
    .update(feedback)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(feedback.id, input.id), eq(feedback.kind, 'general'), eq(feedback.subjectType, 'job')))
    .returning({ id: feedback.id });

  if (!updated) {
    throw feedbackNotFound(input.id);
  }

  const row = await db.query.feedback.findFirst({
    where: eq(feedback.id, input.id),
    with: jobFeedbackRelations,
  });

  if (!row) {
    throw feedbackNotFound(input.id);
  }

  return { item: mapJobFeedbackItem(row) };
}

// Any signed-in submitter may read this minimal user list to choose corrective-user targets; it is
// intentionally lighter than the admin-only `user:list` payload.
export async function listFeedbackTargetUsers({ db }: { db: Db }): Promise<FeedbackTargetUserList> {
  const rows = await db
    .select({ id: user.id, name: user.name, thumbnailDataUrl: user.image })
    .from(user)
    .orderBy(asc(user.name));

  return FeedbackTargetUserList.parse({ users: rows });
}

const feedbackReadRelations = {
  departments: {
    columns: {
      department: true,
    },
    orderBy: asc(feedbackDepartment.department),
  },
  job: {
    columns: {
      code: true,
      id: true,
    },
    with: {
      productUnit: { columns: { productSerialNumber: true } },
      quote: {
        columns: {
          kind: true,
          workTitle: true,
        },
      },
    },
  },
  quote: {
    columns: {
      code: true,
      id: true,
    },
    with: {
      customer: {
        columns: {
          companyName: true,
        },
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
  users: {
    columns: {
      userId: true,
    },
    orderBy: asc(feedbackUser.userId),
    with: {
      user: {
        columns: {
          id: true,
          image: true,
          name: true,
        },
      },
    },
  },
} as const;

/** What a Job's feedback list shows of each note: who said it, and which linked Purchase Order it is about. */
const jobFeedbackRelations = {
  submitter: feedbackReadRelations.submitter,
  purchaseOrder: feedbackPurchaseOrderRelation,
} as const;

function mapFeedbackListItem(row: FeedbackReadRow): FeedbackListItem {
  return FeedbackListItem.parse({
    createdAt: row.createdAt.toISOString(),
    departments: row.departments.map((target) => target.department),
    id: row.id,
    kind: row.kind,
    status: row.status,
    subject: mapFeedbackSubject(row),
    submitter: mapFeedbackSubmitter(row.submitter),
    users: row.users.flatMap((target): FeedbackTargetUserType[] =>
      target.user ? [mapFeedbackTargetUser(target.user)] : [],
    ),
  });
}

function mapFeedbackDetail(row: FeedbackReadRow): FeedbackDetail {
  return FeedbackDetail.parse({
    ...mapFeedbackListItem(row),
    internalNotes: row.internalNotes,
    text: row.text,
  });
}

function mapJobFeedbackItem(
  row: FeedbackRow & {
    submitter: FeedbackReadRow['submitter'];
    purchaseOrder: Parameters<typeof toFeedbackPurchaseOrder>[0];
  },
): JobFeedbackItem {
  return JobFeedbackItem.parse({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    purchaseOrder: toFeedbackPurchaseOrder(row.purchaseOrder),
    status: row.status,
    submitter: mapFeedbackSubmitter(row.submitter),
    text: row.text,
  });
}

function mapFeedbackSubmitter(row: FeedbackReadRow['submitter']): FeedbackSubmitter {
  return FeedbackSubmitter.parse({
    email: row.email,
    id: row.id,
    name: row.name,
    thumbnailDataUrl: row.image ?? null,
  });
}

function mapFeedbackTargetUser(row: NonNullable<FeedbackReadRow['users'][number]['user']>): FeedbackTargetUserType {
  return FeedbackTargetUser.parse({
    id: row.id,
    name: row.name,
    thumbnailDataUrl: row.image ?? null,
  });
}

function mapFeedbackSubject(row: FeedbackReadRow): FeedbackListItem['subject'] {
  if (row.subjectType === 'quote' && row.quote) {
    return {
      id: row.quote.id,
      label: `${QuoteCode.parse(row.quote.code)} · ${row.quote.customer.companyName}`,
      subjectType: 'quote',
    };
  }

  if (row.subjectType === 'job' && row.job) {
    return {
      id: row.job.id,
      label: getJobCodeWithHint({
        code: JobCode.parse(row.job.code),
        productName: null,
        productUnit: row.job.productUnit ?? null,
        quoteKind: row.job.quote?.kind ?? null,
        workTitle: row.job.quote?.workTitle ?? null,
      }),
      subjectType: 'job',
    };
  }

  throw new Error(`Feedback ${row.id} is missing its ${row.subjectType} subject`);
}

export async function listPurchaseOrderFeedback({
  db,
  input,
}: {
  db: Db;
  input: PurchaseOrderFeedbackListInput;
}): Promise<PurchaseOrderFeedbackListResult> {
  const rows = await db.query.feedback.findMany({
    where: and(eq(feedback.purchaseOrderId, input.purchaseOrderId), eq(feedback.kind, 'general')),
    orderBy: [desc(feedback.createdAt), desc(feedback.id)],
    with: { submitter: feedbackReadRelations.submitter },
  });
  return {
    items: rows.map((row) =>
      PurchaseOrderFeedbackItem.parse({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        text: row.text,
        submitter: mapFeedbackSubmitter(row.submitter),
      }),
    ),
  };
}
