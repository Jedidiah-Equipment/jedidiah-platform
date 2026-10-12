import { user } from '@pkg/db';
import type { Business } from '@pkg/schema';
import { sql } from 'drizzle-orm';

/**
 * The role a person holds in `business`, in SQL: the query-side twin of `getBusinessRole(access, business)`.
 * super-admin is stored once, in the Equipment slot, and spans both businesses (ADR 0017).
 */
export const businessRoleSql = (business: Business) =>
  business === 'equipment'
    ? sql<string | null>`${user.role}`
    : sql<string | null>`case when ${user.role} = 'super-admin' then ${user.role} else ${user.contractingRole} end`;
