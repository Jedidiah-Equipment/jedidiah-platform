import { user } from '@pkg/db';
import { sql } from 'drizzle-orm';

/**
 * The role a person holds on the Contracting side, in SQL: super-admin is stored once, in the Equipment slot, and
 * spans both businesses (ADR 0017). The query-side twin of `getBusinessRole(access, 'contracting')`.
 */
export const contractingBusinessRole = () =>
  sql<string | null>`case when ${user.role} = 'super-admin' then ${user.role} else ${user.contractingRole} end`;
