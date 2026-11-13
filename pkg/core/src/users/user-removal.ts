import type { DatabaseTransaction, Db } from '@pkg/db';
import type { AuthId, UserRemovalVerdict } from '@pkg/schema';
import { sql } from 'drizzle-orm';

export type UserForeignKey = { schema: string; table: string; column: string; cascades: boolean };

/**
 * Every column whose foreign key points at `public."user"`, read from the catalog so a table added later is covered
 * without anyone remembering it. A cascading key goes with the User on Remove; any other key is history.
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
 * Whether anything references this User through a foreign key that does not cascade. RESTRICT keys would block the
 * delete anyway; SET NULL keys (an audit actor, an importer) count too, because deleting would silently turn that
 * person into "System". Audit events *about* the User reference it by text, not by key, and are not history.
 */
export async function getUserRemovalVerdict({
  db,
  userId,
}: {
  db: Db | DatabaseTransaction;
  userId: AuthId;
}): Promise<UserRemovalVerdict> {
  const historyKeys = (await listUserForeignKeys(db)).filter((key) => !key.cascades);
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
