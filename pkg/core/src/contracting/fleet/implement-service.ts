import { createEscapedContainsSearchCondition, type Db } from '@pkg/db';
import { contractingImplements } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import {
  FleetCode,
  type FleetListInput,
  FleetRetireInput,
  Implement,
  type ImplementCreateInput,
  type ImplementPatchInput,
} from '@pkg/schema/contracting';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assertNotRetired, FleetError, withFleetConstraints } from './fleet-errors.js';
import { removeFleetEntry } from './remove-fleet-entry.js';

type Row = typeof contractingImplements.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_implement',
  noun: 'implement',
  primaryLabelField: 'code',
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _created, updatedAt: _updated, ...row }) => ({
    ...row,
    retiredAt: row.retiredAt?.toISOString() ?? null,
  }),
});
function mapImplement(row: Row) {
  return Implement.parse({
    ...row,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export async function listImplements({ db, input }: { db: Db; input: FleetListInput }) {
  const rows = await db
    .select()
    .from(contractingImplements)
    .where(
      and(
        input.status === 'active'
          ? isNull(contractingImplements.retiredAt)
          : input.status === 'retired'
            ? isNotNull(contractingImplements.retiredAt)
            : undefined,
        input.search
          ? createEscapedContainsSearchCondition(sql`${contractingImplements.code}`, input.search)
          : undefined,
      ),
    )
    .orderBy(asc(contractingImplements.code));
  return rows.map(mapImplement);
}
export async function getImplement({ db, id }: { db: Db; id: string }) {
  const [row] = await db.select().from(contractingImplements).where(eq(contractingImplements.id, id));
  if (!row) throw new FleetError('fleet.not_found', 'Implement not found.');
  return mapImplement(row);
}
export async function createImplement({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ImplementCreateInput;
}) {
  return withFleetConstraints(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contractingImplements)
        .values({ ...input, code: FleetCode.parse(input.code) })
        .returning();
      if (!row) throw new Error('Implement insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return mapImplement(row);
    }),
  );
}
export async function patchImplement({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ImplementPatchInput;
}) {
  return withFleetConstraints(() =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingImplements,
      id: input.id,
      notFound: () => new FleetError('fleet.not_found', 'Implement not found.'),
      assert: (_tx, row) => assertNotRetired(row),
      set: (before) => ({
        code: input.code === undefined ? before.code : FleetCode.parse(input.code),
        implementType: input.implementType ?? before.implementType,
        notes: input.notes === undefined ? before.notes : input.notes,
        updatedAt: new Date(),
      }),
      project: (_tx, row) => mapImplement(row),
    }),
  );
}
export async function retireImplement({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: FleetRetireInput;
}) {
  const { id, reason } = FleetRetireInput.parse(input);
  return mutateEntity({
    db,
    actorUserId,
    descriptor,
    table: contractingImplements,
    id,
    notFound: () => new FleetError('fleet.not_found', 'Implement not found.'),
    assert: (_tx, row) => assertNotRetired(row),
    set: () => ({ retiredAt: new Date(), retiredReason: reason, updatedAt: new Date() }),
    project: (_tx, row) => mapImplement(row),
  });
}
export async function removeImplement(args: { db: Db; actorUserId: AuthId; id: string }) {
  return removeFleetEntry({ ...args, table: contractingImplements, descriptor, assert: assertNotRetired });
}
export async function implementTypes({ db }: { db: Db }) {
  return (
    await db
      .selectDistinct({ value: contractingImplements.implementType })
      .from(contractingImplements)
      .orderBy(asc(contractingImplements.implementType))
  ).map((row) => row.value);
}
