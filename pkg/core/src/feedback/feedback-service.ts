import { type Db, feedback, jobs, quotes } from '@pkg/db';
import type { AuthId, FeedbackSubmitInput } from '@pkg/schema';
import { Feedback } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { FeedbackSubjectNotFoundError } from './feedback-errors.js';

type FeedbackRow = typeof feedback.$inferSelect;

export function mapFeedback(row: FeedbackRow): Feedback {
  return Feedback.parse({
    createdAt: row.createdAt.toISOString(),
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
  });
}

// There is no `feedback:create` permission: any authenticated caller may submit. The subject is
// resolved here on the server so feedback always attaches to a real Quote or Job.
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

  const [row] = await db
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

  return mapFeedback(row);
}
