import type { Db } from '@pkg/db';
import { contractingWorkTypes } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { WorkType, type WorkTypeCreateInput, type WorkTypePatchInput } from '@pkg/schema/contracting';
import { asc, eq } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { DirectoryError, withDirectoryConstraints } from '../directory-errors.js';

const descriptor = defineAuditDescriptor<typeof contractingWorkTypes.$inferSelect>({
  entityType: 'contracting_work_type',
  noun: 'work type',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({ name: row.name, active: row.active }),
});
export async function listWorkTypes({ db }: { db: Db }) {
  return (
    await db.select().from(contractingWorkTypes).orderBy(asc(contractingWorkTypes.name), asc(contractingWorkTypes.id))
  ).map((row) => WorkType.parse(row));
}
export async function workTypeOptions({ db }: { db: Db }) {
  return (
    await db
      .select()
      .from(contractingWorkTypes)
      .where(eq(contractingWorkTypes.active, true))
      .orderBy(asc(contractingWorkTypes.name), asc(contractingWorkTypes.id))
  ).map((row) => WorkType.parse(row));
}
export async function getWorkType({ db, id }: { db: Db; id: string }) {
  const [row] = await db.select().from(contractingWorkTypes).where(eq(contractingWorkTypes.id, id));
  if (!row) throw new DirectoryError('directory.not_found', 'Work type not found.');
  return WorkType.parse(row);
}
export async function createWorkType({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: WorkTypeCreateInput;
}) {
  return withDirectoryConstraints(() =>
    db.transaction(async (tx) => {
      const [row] = await tx.insert(contractingWorkTypes).values(input).returning();
      if (!row) throw new Error('Work type insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return WorkType.parse(row);
    }),
  );
}
export async function patchWorkType({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: WorkTypePatchInput;
}) {
  return withDirectoryConstraints(() =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingWorkTypes,
      id: input.id,
      notFound: () => new DirectoryError('directory.not_found', 'Work type not found.'),
      set: (before) => ({ name: input.name ?? before.name, active: input.active ?? before.active }),
      project: (_tx, row) => WorkType.parse(row),
    }),
  );
}
