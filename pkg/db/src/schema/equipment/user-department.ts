import type { Department } from '@pkg/schema/equipment';
import { relations } from 'drizzle-orm';
import { primaryKey, text } from 'drizzle-orm/pg-core';

import { user } from '../auth.js';
import { equipmentSchema } from './pg-schema.js';

// Department Membership is descriptive only (ADR 0017): it never grants, scopes, or denies access,
// which is why it is an Equipment table hanging off the shared user rather than part of auth.
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

export const userDepartmentRelations = relations(userDepartment, ({ one }) => ({
  user: one(user, {
    fields: [userDepartment.userId],
    references: [user.id],
  }),
}));
