import { createEscapedContainsSearchCondition, type DatabaseTransaction, type Db, user } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import { formatJobNumber } from '@pkg/domain/contracting';
import type { AuthId, ContractingRole } from '@pkg/schema';
import {
  FieldMachine,
  FleetCode,
  type FleetRetireInput,
  Machine,
  type MachineCreateInput,
  type MachineListInput,
  type MachinePatchInput,
} from '@pkg/schema/contracting';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { assertCategoryKind } from './category-service.js';
import {
  type CategoryRelation,
  projectCategory,
  projectTimestamps,
  removeFleetEntry,
  retireFleetEntry,
  retirementFilter,
} from './fleet-entry.js';
import { assertNotRetired, FleetError, notFound, withFleetConstraints } from './fleet-errors.js';

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
function mapMachine(row: Row & { category: CategoryRelation; currentDriver: { name: string } | null }) {
  const { category, currentDriver, ...fields } = row;
  return Machine.parse({
    ...fields,
    ...projectCategory(category),
    ...projectTimestamps(row),
    currentDriverName: currentDriver?.name ?? null,
  });
}
export async function listMachines({ db, input }: { db: Db; input: MachineListInput }) {
  const rows = await db.query.contractingMachines.findMany({
    where: and(
      retirementFilter(contractingMachines, input.status),
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
  if (!row) throw notFound('Machine');
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
      await assertCategoryKind(tx, input.categoryId, 'machine');
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
      notFound: () => notFound('Machine'),
      assert: async (tx, before) => {
        assertNotRetired(before);
        if (input.categoryId !== undefined) await assertCategoryKind(tx, input.categoryId, 'machine');
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
export async function retireMachine(args: { db: Db; actorUserId: AuthId; input: FleetRetireInput }) {
  return retireFleetEntry({
    ...args,
    table: contractingMachines,
    descriptor,
    noun: 'Machine',
    alsoSet: { currentDriverUserId: null },
    project: (tx, row) => getMachine({ db: tx, id: row.id }),
  });
}
export async function removeMachine(args: { db: Db; actorUserId: AuthId; id: string }) {
  return removeFleetEntry({ ...args, table: contractingMachines, descriptor, assert: assertNotRetired });
}
export async function machineOptions({ db }: { db: Db }) {
  const [makes, models, drivers] = await Promise.all([
    db
      .selectDistinct({ value: contractingMachines.make })
      .from(contractingMachines)
      .orderBy(asc(contractingMachines.make)),
    db
      .selectDistinct({ value: contractingMachines.model })
      .from(contractingMachines)
      .orderBy(asc(contractingMachines.model)),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(eq(user.contractingRole, 'driver'), eq(user.isDevice, false)))
      .orderBy(asc(user.name)),
  ]);
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
  const machines = await listMachines({ db, input: { status: 'active', search: '' } });
  const onSite = machines.length
    ? await db
        .select({ machineId: contractingMachineAssignments.machineId, jobCode: contractingJobs.code })
        .from(contractingMachineAssignments)
        .innerJoin(contractingJobs, eq(contractingJobs.id, contractingMachineAssignments.jobId))
        .where(
          and(
            inArray(
              contractingMachineAssignments.machineId,
              machines.map((machine) => machine.id),
            ),
            isNotNull(contractingMachineAssignments.arrivalReadingId),
            isNull(contractingMachineAssignments.departureReadingId),
          ),
        )
    : [];
  const jobByMachine = new Map(onSite.map((row) => [row.machineId, formatJobNumber(row.jobCode)]));
  return machines.map((machine) =>
    FieldMachine.parse({ ...machine, onSiteJobNumber: jobByMachine.get(machine.id) ?? null }),
  );
}
