import { type JohnDeereOrganization, johnDeereConnectionStatuses } from '@pkg/schema/contracting';
import { sql } from 'drizzle-orm';
import { check, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { quotedList } from '../columns.js';
import { timestamps } from './columns.js';
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
