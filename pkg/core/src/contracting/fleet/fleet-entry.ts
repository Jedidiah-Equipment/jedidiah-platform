import type { DatabaseTransaction, Db } from '@pkg/db';
import type { AuthId } from '@pkg/schema';
import { type CategoryColour, type CategoryIconKey, FleetRetireInput } from '@pkg/schema/contracting';
import { isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { AuditDescriptor } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { removeAudited } from '../remove-audited.js';
import { assertNotRetired, FleetError, notFound } from './fleet-errors.js';

/** What Machines and Implements share: a code, a category, and a retirement that ends their history. */
type FleetEntryTable = PgTable & { id: PgColumn; retiredAt: PgColumn; retiredReason: PgColumn; updatedAt: PgColumn };
type FleetEntryRow = { id: string; retiredAt: Date | null };

export function retirementFilter(table: FleetEntryTable, status: 'active' | 'retired' | 'all'): SQL | undefined {
  if (status === 'active') return isNull(table.retiredAt);
  if (status === 'retired') return isNotNull(table.retiredAt);
  return undefined;
}

export type CategoryRelation = { name: string; icon: CategoryIconKey; colour: CategoryColour };
export const projectCategory = (category: CategoryRelation) => ({
  categoryName: category.name,
  categoryIcon: category.icon,
  categoryColour: category.colour,
});
export const projectTimestamps = (row: FleetEntryRow & { createdAt: Date; updatedAt: Date }) => ({
  retiredAt: row.retiredAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function retireFleetEntry<TTable extends FleetEntryTable, TResult>({
  db,
  actorUserId,
  input,
  table,
  descriptor,
  noun,
  alsoSet,
  project,
}: {
  db: Db;
  actorUserId: AuthId;
  input: FleetRetireInput;
  table: TTable;
  descriptor: AuditDescriptor<TTable['$inferSelect']>;
  noun: string;
  /** Columns a retirement also clears, such as a Machine's driver. */
  alsoSet?: Partial<TTable['$inferInsert']>;
  project: (tx: DatabaseTransaction, row: TTable['$inferSelect']) => Promise<TResult> | TResult;
}) {
  const { id, reason } = FleetRetireInput.parse(input);
  // FleetEntryTable guarantees these three columns exist; TypeScript cannot map a generic table's
  // columns onto its insert type, so the proven shape is asserted once here.
  const retirement = { retiredAt: new Date(), retiredReason: reason, updatedAt: new Date() } as Partial<
    TTable['$inferInsert']
  >;
  return mutateEntity<TTable, TResult>({
    db,
    actorUserId,
    descriptor,
    table,
    id,
    notFound: () => notFound(noun),
    assert: (_tx, row) => assertNotRetired(row as FleetEntryRow),
    set: () => ({ ...retirement, ...alsoSet }),
    project,
  });
}

export const removeFleetEntry = <TTable extends PgTable & { id: PgColumn }>(args: {
  db: Db;
  actorUserId: AuthId;
  id: string;
  table: TTable;
  descriptor: AuditDescriptor<TTable['$inferSelect']>;
  assert?: (row: TTable['$inferSelect']) => void;
}) =>
  removeAudited({
    ...args,
    notFound: () => notFound('Fleet entry'),
    inUse: () =>
      new FleetError(
        'fleet.in_use',
        'This entry has linked records. Retire fleet entries with history instead of deleting them.',
      ),
  });
