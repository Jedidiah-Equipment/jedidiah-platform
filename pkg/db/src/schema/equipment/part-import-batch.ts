import type { PartImportBatchOutcome } from '@pkg/schema/equipment';
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from '../auth.js';
import { parts } from './part.js';
import { equipmentSchema } from './pg-schema.js';

/**
 * One completed Parts Bulk CSV import, saved so its Parts can be found and labelled later. Its counts
 * describe the rows the server received and never change; the raw file is never kept.
 */
export const partImportBatches = equipmentSchema.table(
  'part_import_batch',
  {
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    createdCount: integer('created_count').notNull(),
    fileName: text('file_name'),
    id: uuid('id').defaultRandom().primaryKey(),
    importedByUserId: text('imported_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    rejectedCount: integer('rejected_count').notNull(),
    unchangedCount: integer('unchanged_count').notNull(),
    updatedCount: integer('updated_count').notNull(),
  },
  (table) => [
    check(
      'part_import_batch_counts_nonnegative',
      sql`${table.createdCount} >= 0 AND ${table.updatedCount} >= 0 AND ${table.unchangedCount} >= 0 AND ${table.rejectedCount} >= 0`,
    ),
    index('part_import_batch_completed_at_idx').on(table.completedAt.desc(), table.id.desc()),
  ],
);

/**
 * One successful row of a batch. It is keyed by the row's line rather than its Part, so a later Part
 * Merge that points two members at one survivor keeps both original outcomes. The code and name are
 * what the row imported; `partId` follows the Part as it is now, and a merge re-points it (ADR 0020).
 */
export const partImportBatchMembers = equipmentSchema.table(
  'part_import_batch_member',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => partImportBatches.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    outcome: text('outcome').notNull().$type<PartImportBatchOutcome>(),
    partCode: text('part_code').notNull(),
    partId: uuid('part_id').references(() => parts.id, { onDelete: 'set null' }),
    partName: text('part_name').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.batchId, table.lineNumber], name: 'part_import_batch_member_pkey' }),
    check('part_import_batch_member_outcome_check', sql`${table.outcome} IN ('created', 'updated', 'unchanged')`),
    check('part_import_batch_member_line_number_positive', sql`${table.lineNumber} >= 1`),
    index('part_import_batch_member_part_id_idx').on(table.partId),
  ],
);

export const partImportBatchesRelations = relations(partImportBatches, ({ many, one }) => ({
  importedBy: one(user, {
    fields: [partImportBatches.importedByUserId],
    references: [user.id],
  }),
  members: many(partImportBatchMembers),
}));

export const partImportBatchMembersRelations = relations(partImportBatchMembers, ({ one }) => ({
  batch: one(partImportBatches, {
    fields: [partImportBatchMembers.batchId],
    references: [partImportBatches.id],
  }),
  part: one(parts, {
    fields: [partImportBatchMembers.partId],
    references: [parts.id],
  }),
}));
