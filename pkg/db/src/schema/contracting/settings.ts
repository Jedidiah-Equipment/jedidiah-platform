import { sql } from 'drizzle-orm';
import { check, integer, text } from 'drizzle-orm/pg-core';
import { hours, timestamps } from './columns.js';
import { contractingSchema } from './pg-schema.js';

export const CONTRACTING_SETTINGS_ID = 'contracting';

/** The one row of Contracting Settings. Thresholds are read live by every derivation that names them. */
export const contractingSettings = contractingSchema.table(
  'settings',
  {
    id: text('id').primaryKey().default(CONTRACTING_SETTINGS_ID),
    gapFlagThresholdHours: hours('gap_flag_threshold_hours').notNull().default(4),
    serviceDueSoonThresholdHours: integer('service_due_soon_threshold_hours').notNull().default(100),
    utilisationTargetPercent: integer('utilisation_target_percent'),
    ...timestamps(),
  },
  (table) => [
    check('settings_singleton', sql`${table.id} = 'contracting'`),
    check('settings_gap_flag_threshold_bounds', sql`${table.gapFlagThresholdHours} between 0.5 and 48`),
    check('settings_service_due_soon_threshold_bounds', sql`${table.serviceDueSoonThresholdHours} between 0 and 1000`),
    check(
      'settings_utilisation_target_bounds',
      sql`${table.utilisationTargetPercent} is null or ${table.utilisationTargetPercent} between 1 and 100`,
    ),
  ],
);
