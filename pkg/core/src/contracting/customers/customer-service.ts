import type { Db } from '@pkg/db';
import { contractingCustomers } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { Customer, type CustomerCreateInput, type CustomerPatchInput } from '@pkg/schema/contracting';
import { asc, eq } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { DirectoryError, withDirectoryConstraints } from '../directory-errors.js';

type Row = typeof contractingCustomers.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_customer',
  noun: 'customer',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
  }),
});
const mapCustomer = (row: Row) =>
  Customer.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
export async function listCustomers({ db }: { db: Db }) {
  return (
    await db.select().from(contractingCustomers).orderBy(asc(contractingCustomers.name), asc(contractingCustomers.id))
  ).map(mapCustomer);
}
export async function getCustomer({ db, id }: { db: Db; id: string }) {
  const [row] = await db.select().from(contractingCustomers).where(eq(contractingCustomers.id, id));
  if (!row) throw new DirectoryError('directory.not_found', 'Customer not found.');
  return mapCustomer(row);
}
export async function createCustomer({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: CustomerCreateInput;
}) {
  return withDirectoryConstraints('A customer with that name already exists.', () =>
    db.transaction(async (tx) => {
      const [row] = await tx.insert(contractingCustomers).values(input).returning();
      if (!row) throw new Error('Customer insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return mapCustomer(row);
    }),
  );
}
export async function patchCustomer({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: CustomerPatchInput;
}) {
  return withDirectoryConstraints('A customer with that name already exists.', () =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingCustomers,
      id: input.id,
      notFound: () => new DirectoryError('directory.not_found', 'Customer not found.'),
      set: (before) => ({
        name: input.name ?? before.name,
        contactName: input.contactName !== undefined ? input.contactName : before.contactName,
        phone: input.phone !== undefined ? input.phone : before.phone,
        email: input.email !== undefined ? input.email : before.email,
        notes: input.notes !== undefined ? input.notes : before.notes,
        updatedAt: new Date(),
      }),
      project: (_tx, row) => mapCustomer(row),
    }),
  );
}
