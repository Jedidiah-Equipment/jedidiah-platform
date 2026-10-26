import { type JohnDeereOrganization, johnDeereConnectionStatuses } from '@pkg/schema/contracting';
import { sql } from 'drizzle-orm';
import { check, integer, jsonb, numeric, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { quotedList } from '../columns.js';
import { timestamps } from './columns.js';
import { contractingMachines } from './fleet.js';
import { contractingSchema } from './pg-schema.js';

export const JOHN_DEERE_CONNECTION_ID = 'contracting';

/** The one John Deere Connection. Absent until the first Connect; the refresh token is stored encrypted. */
export const contractingJohnDeereConnection = contractingSchema.table(
  'john_deere_connection',
  {
    id: text('id').primaryKey().default(JOHN_DEERE_CONNECTION_ID),
    status: text('status', { enum: johnDeereConnectionStatuses }).notNull().default('not-connected'),
    pendingState: text('pending_state'),
    pendingStateExpiresAt: timestamp('pending_state_expires_at', { withTimezone: true }),
    pendingByUserId: text('pending_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    pendingRefreshTokenCiphertext: text('pending_refresh_token_ciphertext'),
    refreshTokenCiphertext: text('refresh_token_ciphertext'),
    scopes: text('scopes'),
    organizations: jsonb('organizations').$type<JohnDeereOrganization[]>().notNull().default([]),
    connectedByUserId: text('connected_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    check('john_deere_connection_singleton', sql`${table.id} = 'contracting'`),
    check('john_deere_connection_status', sql`${table.status} IN (${quotedList(johnDeereConnectionStatuses)})`),
    check(
      'john_deere_connection_connected_shape',
      sql`${table.status} <> 'connected' OR ${table.refreshTokenCiphertext} IS NOT NULL`,
    ),
  ],
);

/**
 * A John Deere Link pairs one Machine with one Deere machine. It is active while `unlinked_at` is null; unlinking
 * keeps the row and re-linking makes a new one, so the provenance of every reading it fed survives.
 */
export const contractingJohnDeereLinks = contractingSchema.table(
  'john_deere_link',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => contractingMachines.id, { onDelete: 'restrict' }),
    equipmentId: text('equipment_id').notNull(),
    principalId: integer('principal_id').notNull(),
    organizationId: text('organization_id').notNull(),
    // As Deere listed the machine when it was linked.
    serialNumber: text('serial_number'),
    deereName: text('deere_name').notNull(),
    deereMake: text('deere_make'),
    deereModel: text('deere_model'),
    deereModelYear: text('deere_model_year'),
    linkedByUserId: text('linked_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),
    unlinkedByUserId: text('unlinked_by_user_id').references(() => user.id, { onDelete: 'restrict' }),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
    lostAt: timestamp('lost_at', { withTimezone: true }),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    lastReportTime: timestamp('last_report_time', { withTimezone: true }),
    lastValue: numeric('last_value', { precision: 10, scale: 1, mode: 'number' }),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('john_deere_link_active_machine_unique').on(table.machineId).where(sql`${table.unlinkedAt} IS NULL`),
    uniqueIndex('john_deere_link_active_equipment_unique')
      .on(table.equipmentId)
      .where(sql`${table.unlinkedAt} IS NULL`),
    check('john_deere_link_unlinked_shape', sql`(${table.unlinkedAt} IS NULL) = (${table.unlinkedByUserId} IS NULL)`),
  ],
);
