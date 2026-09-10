import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  jsonb,
  numeric,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { contractingMachines } from './fleet.js';
import { contractingSchema } from './pg-schema.js';

export const contractingHourReadings = contractingSchema.table(
  'hour_reading',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => contractingMachines.id, { onDelete: 'restrict' }),
    role: text('role', { enum: ['baseline', 'arrival', 'departure', 'spot'] }).notNull(),
    value: numeric('value', { precision: 10, scale: 1, mode: 'number' }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    capturedByUserId: text('captured_by_user_id')
      .notNull()
      .references(() => user.id),
    method: text('method', { enum: ['photo', 'manual'] }).notNull(),
    comment: text('comment'),
    photo: jsonb('photo').$type<{ byteSize: number; contentType: string; storageKey: string; updatedAt: string }>(),
    aiValue: numeric('ai_value', { precision: 10, scale: 1, mode: 'number' }),
    aiConfidence: numeric('ai_confidence', { precision: 5, scale: 4, mode: 'number' }),
    aiVerification: text('ai_verification', {
      enum: ['pending', 'agrees', 'disagrees', 'low-confidence', 'not-applicable'],
    }).notNull(),
    disputed: boolean('disputed').default(false).notNull(),
    disputeReason: text('dispute_reason'),
    disputedPreviousId: uuid('disputed_previous_id').references((): AnyPgColumn => contractingHourReadings.id),
    evidenceReviewedAt: timestamp('evidence_reviewed_at', { withTimezone: true }),
    amendedBy: text('amended_by').references(() => user.id),
    amendedAt: timestamp('amended_at', { withTimezone: true }),
    amendmentReason: text('amendment_reason'),
  },
  (table) => [
    index('hour_reading_machine_sequence_idx').on(table.machineId, table.sequence),
    check('hour_reading_role', sql`${table.role} IN ('baseline', 'arrival', 'departure', 'spot')`),
    check('hour_reading_value', sql`${table.value} >= 0 AND (${table.aiValue} IS NULL OR ${table.aiValue} >= 0)`),
    check('hour_reading_confidence', sql`${table.aiConfidence} BETWEEN 0 AND 1`),
    check(
      'hour_reading_method',
      sql`(${table.method} = 'manual' AND ${table.photo} IS NULL) OR (${table.method} = 'photo' AND ${table.photo} IS NOT NULL)`,
    ),
    check(
      'hour_reading_verification',
      sql`${table.aiVerification} IN ('pending', 'agrees', 'disagrees', 'low-confidence', 'not-applicable')`,
    ),
    check(
      'hour_reading_amendment',
      sql`(${table.amendedBy} IS NULL AND ${table.amendedAt} IS NULL AND ${table.amendmentReason} IS NULL) OR (${table.amendedBy} IS NOT NULL AND ${table.amendedAt} IS NOT NULL AND ${table.amendmentReason} IS NOT NULL AND length(btrim(${table.amendmentReason})) > 0)`,
    ),
  ],
);
