import { type Db, getForeignKeyViolationConstraint } from '@pkg/db';
import { contractingFarms } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { Farm, type FarmCreateInput, type FarmIdInput, type FarmPatchInput } from '@pkg/schema/contracting';
import { and, asc, eq } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { DirectoryError, withDirectoryConstraints } from '../directory-errors.js';

const descriptor = defineAuditDescriptor<typeof contractingFarms.$inferSelect>({
  entityType: 'contracting_farm',
  noun: 'farm',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({ customerId: row.customerId, name: row.name }),
});
export async function listFarms({ db, customerId }: { db: Db; customerId: string }) {
  return (
    await db
      .select()
      .from(contractingFarms)
      .where(eq(contractingFarms.customerId, customerId))
      .orderBy(asc(contractingFarms.name), asc(contractingFarms.id))
  ).map((row) => Farm.parse(row));
}
export async function createFarm({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: FarmCreateInput }) {
  return withDirectoryConstraints('A farm with that name already exists for this customer.', () =>
    db.transaction(async (tx) => {
      const [row] = await tx.insert(contractingFarms).values(input).returning();
      if (!row) throw new Error('Farm insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return Farm.parse(row);
    }),
  );
}
export async function patchFarm({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: FarmPatchInput }) {
  return withDirectoryConstraints('A farm with that name already exists for this customer.', () =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingFarms,
      id: input.id,
      lockWhere: eq(contractingFarms.customerId, input.customerId),
      notFound: () => new DirectoryError('directory.not_found', 'Farm not found for this customer.'),
      set: () => ({ name: input.name }),
      project: (_tx, row) => Farm.parse(row),
    }),
  );
}
export async function removeFarm({ db, actorUserId, input }: { db: Db; actorUserId: AuthId; input: FarmIdInput }) {
  await db.transaction(async (tx) => {
    const where = and(eq(contractingFarms.id, input.id), eq(contractingFarms.customerId, input.customerId));
    const [before] = await tx.select().from(contractingFarms).where(where).for('update');
    if (!before) throw new DirectoryError('directory.not_found', 'Farm not found for this customer.');
    try {
      // Restrictive foreign keys remain the final guard as later features reference Farms.
      await tx.delete(contractingFarms).where(where);
    } catch (error) {
      if (getForeignKeyViolationConstraint(error))
        throw new DirectoryError('directory.in_use', 'This farm is referenced and cannot be deleted.');
      throw error;
    }
    await recordAuditDelete({ db: tx, actorUserId, descriptor, input: before });
  });
}
