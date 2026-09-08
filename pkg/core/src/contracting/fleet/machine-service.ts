import { createEscapedContainsSearchCondition, type DatabaseTransaction, type Db, user } from '@pkg/db';
import { contractingMachines } from '@pkg/db/contracting';
import type { AuthId, ContractingRole } from '@pkg/schema';
import {
  FieldMachine,
  FleetCode,
  FleetRetireInput,
  Machine,
  type MachineCreateInput,
  type MachineListInput,
  type MachinePatchInput,
} from '@pkg/schema/contracting';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assertNotRetired, FleetError, withFleetConstraints } from './fleet-errors.js';
import { removeFleetEntry } from './remove-fleet-entry.js';

type Row = typeof contractingMachines.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_machine',
  noun: 'machine',
  primaryLabelField: 'code',
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _created, updatedAt: _updated, ...row }) => ({
    ...row,
    retiredAt: row.retiredAt?.toISOString() ?? null,
  }),
});
const related = { category: true, currentDriver: { columns: { name: true } } } as const;
type RelatedRow = Row & { category: { name: string }; currentDriver: { name: string } | null };
function mapMachine(row: RelatedRow) {
  const { category: _category, currentDriver: _driver, ...fields } = row;
  return Machine.parse({
    ...fields,
    categoryName: row.category.name,
    currentDriverName: row.currentDriver?.name ?? null,
    availability: 'in-yard',
    retiredAt: row.retiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export async function listMachines({ db, input }: { db: Db; input: MachineListInput }) {
  const rows = await db.query.contractingMachines.findMany({
    where: and(
      input.status === 'active'
        ? isNull(contractingMachines.retiredAt)
        : input.status === 'retired'
          ? isNotNull(contractingMachines.retiredAt)
          : undefined,
      input.categoryId ? eq(contractingMachines.categoryId, input.categoryId) : undefined,
      input.search ? createEscapedContainsSearchCondition(sql`${contractingMachines.code}`, input.search) : undefined,
    ),
    with: related,
    orderBy: [asc(contractingMachines.code)],
  });
  return rows.map(mapMachine);
}
export async function getMachine({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const row = await db.query.contractingMachines.findFirst({ where: eq(contractingMachines.id, id), with: related });
  if (!row) throw new FleetError('fleet.not_found', 'Machine not found.');
  return mapMachine(row);
}
async function assertDriver(tx: DatabaseTransaction, id: string | null | undefined) {
  if (!id) return;
  const [driver] = await tx
    .select({ role: user.contractingRole, isDevice: user.isDevice })
    .from(user)
    .where(eq(user.id, id))
    .for('share');
  if (driver?.role !== 'driver' || driver.isDevice)
    throw new FleetError('fleet.invalid_driver', 'Select a person with the Contracting driver role.');
}
export async function createMachine({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: MachineCreateInput;
}) {
  return withFleetConstraints(() =>
    db.transaction(async (tx) => {
      await assertDriver(tx, input.currentDriverUserId);
      const [row] = await tx
        .insert(contractingMachines)
        .values({ ...input, code: FleetCode.parse(input.code) })
        .returning();
      if (!row) throw new Error('Machine insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return getMachine({ db: tx, id: row.id });
    }),
  );
}
export async function patchMachine({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: MachinePatchInput;
}) {
  return withFleetConstraints(() =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingMachines,
      id: input.id,
      notFound: () => new FleetError('fleet.not_found', 'Machine not found.'),
      assert: async (tx, before) => {
        assertNotRetired(before);
        await assertDriver(
          tx,
          input.currentDriverUserId === undefined ? before.currentDriverUserId : input.currentDriverUserId,
        );
      },
      set: (before) => ({
        code: input.code === undefined ? before.code : FleetCode.parse(input.code),
        make: input.make ?? before.make,
        model: input.model ?? before.model,
        categoryId: input.categoryId ?? before.categoryId,
        year: input.year === undefined ? before.year : input.year,
        registration: input.registration === undefined ? before.registration : input.registration,
        currentDriverUserId:
          input.currentDriverUserId === undefined ? before.currentDriverUserId : input.currentDriverUserId,
        notes: input.notes === undefined ? before.notes : input.notes,
        serviceIntervalHours:
          input.serviceIntervalHours === undefined ? before.serviceIntervalHours : input.serviceIntervalHours,
        nextServiceDueHours:
          input.nextServiceDueHours === undefined ? before.nextServiceDueHours : input.nextServiceDueHours,
        updatedAt: new Date(),
      }),
      project: (tx, row) => getMachine({ db: tx, id: row.id }),
    }),
  );
}
export async function retireMachine({
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
    table: contractingMachines,
    id,
    notFound: () => new FleetError('fleet.not_found', 'Machine not found.'),
    assert: (_tx, row) => assertNotRetired(row),
    set: () => ({ retiredAt: new Date(), retiredReason: reason, currentDriverUserId: null, updatedAt: new Date() }),
    project: (tx, row) => getMachine({ db: tx, id: row.id }),
  });
}
export async function removeMachine(args: { db: Db; actorUserId: AuthId; id: string }) {
  return removeFleetEntry({ ...args, table: contractingMachines, descriptor, assert: assertNotRetired });
}
export async function machineOptions({ db }: { db: Db }) {
  const makes = await db
    .selectDistinct({ value: contractingMachines.make })
    .from(contractingMachines)
    .orderBy(asc(contractingMachines.make));
  const models = await db
    .selectDistinct({ value: contractingMachines.model })
    .from(contractingMachines)
    .orderBy(asc(contractingMachines.model));
  const drivers = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.contractingRole, 'driver'), eq(user.isDevice, false)))
    .orderBy(asc(user.name));
  return { makes: makes.map((row) => row.value), models: models.map((row) => row.value), drivers };
}

export async function assertDriverAccountChangeAllowed({
  db,
  userId,
  contractingRole,
  isDevice,
}: {
  db: Db;
  userId: AuthId;
  contractingRole?: ContractingRole | null | undefined;
  isDevice?: boolean | undefined;
}) {
  if ((contractingRole === undefined || contractingRole === 'driver') && isDevice !== true) return;
  const machine = await db.query.contractingMachines.findFirst({
    where: eq(contractingMachines.currentDriverUserId, userId),
    columns: { id: true },
  });
  if (machine)
    throw new FleetError(
      'fleet.driver_assigned',
      'Unassign this driver from Contracting Machines before changing their role or making them a Device Account.',
    );
}

export async function listFieldMachines({ db }: { db: Db }) {
  return (await listMachines({ db, input: { status: 'active', search: '' } })).map((machine) =>
    FieldMachine.parse(machine),
  );
}
