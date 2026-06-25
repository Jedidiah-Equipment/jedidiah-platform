import type { Department, FeedbackKind, FeedbackStatus, FeedbackSubjectType } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

// Corrective-department targets. The department enum is the only value, so the row key is
// (feedback, department); deleting the feedback cascades the links away.
export const feedbackDepartment = pgTable(
  'feedback_department',
  {
    feedbackId: uuid('feedback_id')
      .notNull()
      .references(() => feedback.id, { onDelete: 'cascade' }),
    department: text('department').notNull().$type<Department>(),
  },
  (table) => [
    primaryKey({ columns: [table.feedbackId, table.department], name: 'feedback_department_pkey' }),
    check(
      'feedback_department_value_check',
      sql`${table.department} IN ('procurement', 'supply', 'fabrication', 'paint', 'assembly')`,
    ),
  ],
);

// Corrective-user targets. Deleting a targeted user cascades only this link, leaving the feedback
// and its other targets intact.
export const feedbackUser = pgTable(
  'feedback_user',
  {
    feedbackId: uuid('feedback_id')
      .notNull()
      .references(() => feedback.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.feedbackId, table.userId], name: 'feedback_user_pkey' })],
);

export const feedbackRelations = relations(feedback, ({ one, many }) => ({
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
  departments: many(feedbackDepartment),
  users: many(feedbackUser),
}));

export const feedbackDepartmentRelations = relations(feedbackDepartment, ({ one }) => ({
  feedback: one(feedback, {
    fields: [feedbackDepartment.feedbackId],
    references: [feedback.id],
  }),
}));

export const feedbackUserRelations = relations(feedbackUser, ({ one }) => ({
  feedback: one(feedback, {
    fields: [feedbackUser.feedbackId],
    references: [feedback.id],
  }),
  user: one(user, {
    fields: [feedbackUser.userId],
    references: [user.id],
  }),
}));
