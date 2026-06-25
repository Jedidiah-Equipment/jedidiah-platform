import { type Db, feedback, feedbackDepartment, feedbackUser, jobs, quotes, user } from '@pkg/db';
import type { AuthId, FeedbackSubmitInput, FeedbackTargetUserList } from '@pkg/schema';
import { Feedback } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';

import { FeedbackSubjectNotFoundError } from './feedback-errors.js';

type FeedbackRow = typeof feedback.$inferSelect;

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

// Any signed-in submitter may read this minimal user list to choose corrective-user targets; it is
// intentionally lighter than the admin-only `user:list` payload.
export async function listFeedbackTargetUsers({ db }: { db: Db }): Promise<FeedbackTargetUserList> {
  const rows = await db.select({ id: user.id, name: user.name }).from(user).orderBy(asc(user.name));

  return { users: rows };
}
