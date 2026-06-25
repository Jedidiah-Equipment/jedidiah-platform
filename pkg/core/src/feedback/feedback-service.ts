import { type Db, feedback, feedbackDepartment, feedbackUser, jobs, quotes, user } from '@pkg/db';
import type {
  AuthId,
  Department,
  FeedbackDetailInput,
  FeedbackListInput,
  FeedbackListResult,
  FeedbackStatus,
  FeedbackSubmitInput,
  FeedbackTargetUser as FeedbackTargetUserType,
  FeedbackUpdateInput,
} from '@pkg/schema';
import {
  Feedback,
  FeedbackDetail,
  FeedbackListItem,
  FeedbackSubmitter,
  FeedbackTargetUser,
  FeedbackTargetUserList,
  JobCode,
  QuoteCode,
} from '@pkg/schema';
import { asc, desc, eq } from 'drizzle-orm';

import { FeedbackNotFoundError, FeedbackSubjectNotFoundError } from './feedback-errors.js';

type FeedbackRow = typeof feedback.$inferSelect;
type FeedbackReadRow = FeedbackRow & {
  departments: { department: Department }[];
  job: { code: number; id: string; productSerialNumber: string } | null;
  quote: { code: number; customer: { companyName: string }; id: string } | null;
  submitter: { email: string; id: string; image?: string | null; name: string };
  users: { user: { id: string; image?: string | null; name: string } | null; userId: string }[];
};

function mapFeedback(row: FeedbackRow, targets: { departments: string[]; userIds: string[] }): Feedback {
  return Feedback.parse({
    createdAt: row.createdAt.toISOString(),
    departments: targets.departments,
    id: row.id,
    internalNotes: row.internalNotes,
    jobId: row.jobId,
    kind: row.kind,
    quoteId: row.quoteId,
    status: row.status,
    subjectType: row.subjectType,
    submitterId: row.submitterId,
    text: row.text,
    updatedAt: row.updatedAt.toISOString(),
    userIds: targets.userIds,
  });
}

// There is no `feedback:create` permission: any authenticated caller may submit. The subject is
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
}): Promise<Feedback> {
  const { subject } = input;

  if (subject.subjectType === 'quote') {
    const exists = await db.query.quotes.findFirst({ columns: { id: true }, where: eq(quotes.id, subject.quoteId) });

    if (!exists) {
      throw new FeedbackSubjectNotFoundError('quote', subject.quoteId);
    }
  } else {
    const exists = await db.query.jobs.findFirst({ columns: { id: true }, where: eq(jobs.id, subject.jobId) });

    if (!exists) {
      throw new FeedbackSubjectNotFoundError('job', subject.jobId);
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
        quoteId: subject.subjectType === 'quote' ? subject.quoteId : null,
        subjectType: subject.subjectType,
        submitterId,
        text: input.text,
      })
      .returning();

    if (!row) {
      throw new Error('Feedback insert did not return a row');
    }

    if (departments.length > 0) {
      await tx.insert(feedbackDepartment).values(departments.map((department) => ({ department, feedbackId: row.id })));
    }

    if (userIds.length > 0) {
      await tx.insert(feedbackUser).values(userIds.map((userId) => ({ feedbackId: row.id, userId })));
    }

    return mapFeedback(row, { departments, userIds });
  });
}

export async function listFeedback({ db, input }: { db: Db; input: FeedbackListInput }): Promise<FeedbackListResult> {
  const rows = await db.query.feedback.findMany({
    orderBy: [desc(feedback.createdAt), asc(feedback.id)],
    where: input.status ? eq(feedback.status, input.status) : undefined,
    with: feedbackReadRelations,
  });

  return {
    items: rows.map((row) => mapFeedbackListItem(row)),
  };
}

export async function getFeedback({
  db,
  input,
}: {
  db: Db;
  input: FeedbackDetailInput;
}): Promise<FeedbackDetail | null> {
  const row = await db.query.feedback.findFirst({
    where: eq(feedback.id, input.id),
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
    .where(eq(feedback.id, input.id))
    .returning({ id: feedback.id });

  if (!updated) {
    throw new FeedbackNotFoundError(input.id);
  }

  const detail = await getFeedback({ db, input: { id: input.id } });

  if (!detail) {
    throw new FeedbackNotFoundError(input.id);
  }

  return detail;
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
      productSerialNumber: true,
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

function mapFeedbackListItem(row: FeedbackReadRow): FeedbackListItem {
  return FeedbackListItem.parse({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: row.kind,
    status: row.status,
    subject: mapFeedbackSubject(row),
    submitter: mapFeedbackSubmitter(row.submitter),
  });
}

function mapFeedbackDetail(row: FeedbackReadRow): FeedbackDetail {
  return FeedbackDetail.parse({
    ...mapFeedbackListItem(row),
    departments: row.departments.map((target) => target.department),
    internalNotes: row.internalNotes,
    text: row.text,
    users: row.users.flatMap((target): FeedbackTargetUserType[] =>
      target.user ? [mapFeedbackTargetUser(target.user)] : [],
    ),
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
      label: `${JobCode.parse(row.job.code)} · ${row.job.productSerialNumber}`,
      subjectType: 'job',
    };
  }

  throw new Error(`Feedback ${row.id} is missing its ${row.subjectType} subject`);
}
