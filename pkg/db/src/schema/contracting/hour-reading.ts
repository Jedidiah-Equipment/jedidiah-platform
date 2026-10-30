import { readingMethods, telematicsProviders } from '@pkg/schema/contracting';
import { sql } from 'drizzle-orm';
import { bigint, check, index, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { quotedList } from '../columns.js';
import { contractingMachines } from './fleet.js';
import { contractingJohnDeereLinks } from './john-deere.js';
import { contractingSchema } from './pg-schema.js';

export const contractingHourReadings = contractingSchema.table(
  'hour_reading',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => contractingMachines.id, { onDelete: 'restrict' }),
    value: numeric('value', { precision: 10, scale: 1, mode: 'number' }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    /** Null for a Telematics Reading: nobody captured it. */
    capturedByUserId: text('captured_by_user_id').references(() => user.id),
    method: text('method', { enum: readingMethods }).notNull(),
    telematicsProvider: text('telematics_provider', { enum: telematicsProviders }),
    /** The Link that fed a Telematics Reading, so the reading says which Deere machine reported it. */
    telematicsLinkId: uuid('telematics_link_id').references(() => contractingJohnDeereLinks.id, {
      onDelete: 'set null',
    }),
    comment: text('comment'),
    amendedBy: text('amended_by').references(() => user.id),
    amendedAt: timestamp('amended_at', { withTimezone: true }),
    amendmentReason: text('amendment_reason'),
    /** Acceptance time — when the server took the reading. Read At (`capturedAt`) may be backdated; this never is. */
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('hour_reading_machine_read_at_idx').on(table.machineId, table.capturedAt, table.sequence),
    index('hour_reading_created_idx').on(table.createdAt, table.id),
    check('hour_reading_value', sql`${table.value} >= 0`),
    check(
      'hour_reading_telematics_provider',
      sql`${table.telematicsProvider} IS NULL OR ${table.telematicsProvider} IN (${quotedList(telematicsProviders)})`,
    ),
    check(
      'hour_reading_method',
      sql`(${table.method} = 'manual' AND ${table.capturedByUserId} IS NOT NULL AND ${table.telematicsProvider} IS NULL AND ${table.telematicsLinkId} IS NULL) OR (${table.method} = 'telematics' AND ${table.capturedByUserId} IS NULL AND ${table.telematicsProvider} IS NOT NULL AND ${table.telematicsLinkId} IS NOT NULL AND ${table.comment} IS NULL AND ${table.amendedBy} IS NULL)`,
    ),
    check(
      'hour_reading_amendment',
      sql`(${table.amendedBy} IS NULL AND ${table.amendedAt} IS NULL AND ${table.amendmentReason} IS NULL) OR (${table.amendedBy} IS NOT NULL AND ${table.amendedAt} IS NOT NULL AND ${table.amendmentReason} IS NOT NULL AND length(btrim(${table.amendmentReason})) > 0)`,
    ),
  ],
);
