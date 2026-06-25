import type { FeedbackKind, FeedbackStatus, FeedbackSubjectType } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { jobs } from './job.js';
import { quotes } from './quote.js';

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submitterId: text('submitter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    subjectType: text('subject_type').notNull().$type<FeedbackSubjectType>(),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<FeedbackKind>(),
    text: text('text').notNull(),
    internalNotes: text('internal_notes'),
    status: text('status').notNull().default('open').$type<FeedbackStatus>(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('feedback_subject_type_check', sql`${table.subjectType} IN ('quote', 'job')`),
    check(
      'feedback_kind_check',
      sql`${table.kind} IN ('general', 'corrective-feedback-department', 'corrective-feedback-user')`,
    ),
    check('feedback_status_check', sql`${table.status} IN ('open', 'resolved', 'closed')`),
    check('feedback_text_nonempty', sql`length(trim(${table.text})) > 0`),
    // Exactly one subject is set and it matches the discriminator.
    check(
      'feedback_subject_exactly_one',
      sql`(${table.subjectType} = 'quote' AND ${table.quoteId} IS NOT NULL AND ${table.jobId} IS NULL)
        OR (${table.subjectType} = 'job' AND ${table.jobId} IS NOT NULL AND ${table.quoteId} IS NULL)`,
    ),
  ],
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  submitter: one(user, {
    fields: [feedback.submitterId],
    references: [user.id],
  }),
  quote: one(quotes, {
    fields: [feedback.quoteId],
    references: [quotes.id],
  }),
  job: one(jobs, {
    fields: [feedback.jobId],
    references: [jobs.id],
  }),
}));
