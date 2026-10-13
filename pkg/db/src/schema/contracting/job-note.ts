import { relations, sql } from 'drizzle-orm';
import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { contractingJobs } from './jobs.js';
import { contractingSchema } from './pg-schema.js';

/** A Job Note: authored and append-only, like a Breakdown Note, and read back through the Activity feed. */
export const contractingJobNotes = contractingSchema.table(
  'job_note',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => contractingJobs.id, { onDelete: 'restrict' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('job_note_job_idx').on(table.jobId, table.createdAt),
    index('job_note_created_idx').on(table.createdAt, table.id),
    check('job_note_text_not_blank', sql`length(btrim(${table.text})) > 0`),
  ],
);

export const contractingJobNoteRelations = relations(contractingJobNotes, ({ one }) => ({
  job: one(contractingJobs, { fields: [contractingJobNotes.jobId], references: [contractingJobs.id] }),
}));
