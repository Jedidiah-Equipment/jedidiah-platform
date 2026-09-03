import { DEFAULT_APP_ROLE } from '@pkg/domain';
import type { Department } from '@pkg/schema';
import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { equipmentSchema } from './equipment.js';

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull(),
    image: text('image'),
    phoneNumber: text('phone_number'),
    role: text('role').notNull().default(DEFAULT_APP_ROLE),
    /**
     * A shared device rather than a person — today the stores tablet, which signs in as itself and
     * then names whoever is standing at it. Not a role: the tablet's *permissions* are the stores
     * role's, and what this records is that no human is behind the account. The ledger's actor must
     * always be a person, so a device session has to assert one and can never be asserted as one.
     */
    isDevice: boolean('is_device').default(false).notNull(),
    assistantEnabled: boolean('assistant_enabled').default(false).notNull(),
    // Server-owned high-water mark for the cross-Job Activity feed. The default prevents a rollout
    // or newly created account from treating the complete historical feed as unread.
    lastActivitySeen: timestamp('last_activity_seen', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (table) => [index('user_email_idx').on(table.email)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    impersonatedBy: text('impersonated_by'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (table) => [index('session_user_id_idx').on(table.userId), index('session_token_idx').on(table.token)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date' }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date' }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_issuer_account_id_uidx').on(table.issuer, table.accountId),
  ],
);

/**
 * `account.issuer` for the email/password provider — better-auth's
 * `createLocalAccountIssuer('credential')`. Since 1.7 a provider identity is keyed on
 * (issuer, accountId) rather than providerId, and sign-in matches on the pair, so a credential row
 * written without this value fails sign-in as an indistinguishable "invalid email or password".
 */
export const CREDENTIAL_ACCOUNT_ISSUER = 'local:credential';

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userDepartment = equipmentSchema.table(
  'user_department',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    department: text('department').notNull().$type<Department>(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.department],
      name: 'user_department_user_id_department_pk',
    }),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  departments: many(userDepartment),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const userDepartmentRelations = relations(userDepartment, ({ one }) => ({
  user: one(user, {
    fields: [userDepartment.userId],
    references: [user.id],
  }),
}));
