import type { DatabaseTransaction, Db } from '@pkg/db';
import type { AuthId, UserRemovalVerdict } from '@pkg/schema';
import { sql } from 'drizzle-orm';

export type UserForeignKey = { schema: string; table: string; column: string; cascades: boolean };

/**
 * The cascading keys whose rows are the account itself (sign-in, devices, what it has read, its Departments), which
 * Remove may delete with it. Any other key, cascading or not, names the User in a record and is history: a cascade
 * such as a Corrective Feedback target would otherwise vanish silently with the account.
 */
const ACCOUNT_OWNED_TABLES = new Set([
  'equipment.user_department',
  'public.account',
  'public.changelog_view',
  'public.push_token',
  'public.session',
]);

/** Whether a row behind this key keeps a User from being removed. */
export const isRemovalHistory = (key: UserForeignKey) =>
  !(key.cascades && ACCOUNT_OWNED_TABLES.has(`${key.schema}.${key.table}`));

/**
 * Every column whose foreign key points at `public."user"`, read from the catalog so a table added later is covered
 * without anyone remembering it.
 */
export async function listUserForeignKeys(db: Db | DatabaseTransaction): Promise<UserForeignKey[]> {
  const rows = await db.execute<UserForeignKey>(sql`
    SELECT namespace.nspname AS schema, relation.relname AS table, attribute.attname AS column,
      constraint_row.confdeltype = 'c' AS cascades
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = ANY (constraint_row.conkey)
    WHERE constraint_row.contype = 'f' AND constraint_row.confrelid = 'public."user"'::regclass
    ORDER BY namespace.nspname, relation.relname, attribute.attname
  `);

  return [...rows];
}

/**
 * Whether anything outside the account's own rows references this User. RESTRICT keys would block the delete anyway;
 * SET NULL keys (an audit actor, an importer) count too, because deleting would silently turn that person into
 * "System". Audit events *about* the User reference it by text, not by key, and are not history.
 */
export async function getUserRemovalVerdict({
  db,
  userId,
}: {
  db: Db | DatabaseTransaction;
  userId: AuthId;
}): Promise<UserRemovalVerdict> {
  const historyKeys = (await listUserForeignKeys(db)).filter(isRemovalHistory);
  if (historyKeys.length === 0) return { hasHistory: false };

  const references = historyKeys.map(
    (key) =>
      sql`EXISTS (SELECT 1 FROM ${sql.identifier(key.schema)}.${sql.identifier(key.table)} WHERE ${sql.identifier(key.column)} = ${userId})`,
  );
  const [row] = await db.execute<{ has_history: boolean }>(
    sql`SELECT (${sql.join(references, sql` OR `)}) AS has_history`,
  );

  return { hasHistory: row?.has_history === true };
}
