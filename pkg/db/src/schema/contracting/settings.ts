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
    travelFlagThresholdHours: hours('travel_flag_threshold_hours').notNull().default(4),
    johnDeereDifferenceThresholdHours: hours('john_deere_difference_threshold_hours').notNull().default(10),
    serviceDueSoonThresholdHours: integer('service_due_soon_threshold_hours').notNull().default(100),
    utilisationTargetPercent: integer('utilisation_target_percent'),
    ...timestamps(),
  },
  (table) => [
    check('settings_singleton', sql`${table.id} = 'contracting'`),
    check('settings_travel_flag_threshold_bounds', sql`${table.travelFlagThresholdHours} between 0.5 and 48`),
    check(
      'settings_john_deere_difference_threshold_bounds',
      sql`${table.johnDeereDifferenceThresholdHours} between 1 and 200`,
    ),
    check('settings_service_due_soon_threshold_bounds', sql`${table.serviceDueSoonThresholdHours} between 0 and 1000`),
    check(
      'settings_utilisation_target_bounds',
      sql`${table.utilisationTargetPercent} is null or ${table.utilisationTargetPercent} between 1 and 100`,
    ),
  ],
);
