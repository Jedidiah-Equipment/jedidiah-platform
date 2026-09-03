import { relations, sql } from 'drizzle-orm';
import { check, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { equipmentSchema } from './equipment.js';
import { jobs } from './job.js';

/**
 * The assertion that a Job's stock life ended: leftovers returned, remaining commitment released.
 * Insert-only like a ledger row — reopening is not a v1 concept, so there is no update or delete
 * path and the Job id is the primary key, which is what makes closing out a once-only act.
 */
export const jobStockCloseOuts = equipmentSchema.table(
  'job_stock_close_out',
  {
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    jobId: uuid('job_id')
      .primaryKey()
      .references(() => jobs.id, { onDelete: 'restrict' }),
    note: text('note'),
  },
  (table) => [
    check('job_stock_close_out_note_nonempty', sql`${table.note} IS NULL OR length(trim(${table.note})) > 0`),
  ],
);

export const jobStockCloseOutRelations = relations(jobStockCloseOuts, ({ one }) => ({
  actor: one(user, {
    fields: [jobStockCloseOuts.actorUserId],
    references: [user.id],
  }),
  job: one(jobs, {
    fields: [jobStockCloseOuts.jobId],
    references: [jobs.id],
  }),
}));
