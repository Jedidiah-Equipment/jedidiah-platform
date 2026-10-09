import { createEscapedContainsSearchCondition, type DatabaseTransaction, type Db, user } from '@pkg/db';
import {
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
  contractingServiceRecords,
} from '@pkg/db/contracting';
import { formatJobNumber, hoursToService, serviceDueStatus } from '@pkg/domain/contracting';
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
type BusyOnJobRow = {
  id: string;
  code: number;
  customerName: string;
  farmName: string;
  workTypeName: string;
  arrivedAt: string;
};
/** The Machine's newest Hour Reading of any role, so a spot reading moves Service Due Soon as much as a stint does. */
const latestReading = (machine: typeof contractingMachines._.columns) => ({
  latestReadingHours: sql<number | null>`(
    select latest.value::float8
    from contracting.hour_reading latest
    where latest.machine_id = ${machine.id}
    order by latest.sequence desc
    limit 1
  )`.as('latest_reading_hours'),
  latestReadingAt: sql<string | null>`(
    select to_json(latest.captured_at) #>> '{}'
    from contracting.hour_reading latest
    where latest.machine_id = ${machine.id}
    order by latest.sequence desc
    limit 1
  )`.as('latest_reading_at'),
  busyOnJob: sql<BusyOnJobRow | null>`(
    select json_build_object(
      'id', job.id,
      'code', job.code,
      'customerName', customer.name,
      'farmName', farm.name,
      'workTypeName', work_type.name,
      'arrivedAt', arrival.captured_at
    )
    from contracting.machine_assignment stint
    join contracting.job job on job.id = stint.job_id
    join contracting.customer customer on customer.id = job.customer_id
    join contracting.farm farm on farm.id = job.farm_id
    join contracting.work_type work_type on work_type.id = job.work_type_id
    join contracting.hour_reading arrival on arrival.id = stint.arrival_reading_id
    where stint.machine_id = ${machine.id}
      and stint.arrival_reading_id is not null
      and stint.departure_reading_id is null
    limit 1
  )`.as('busy_on_job'),
});
function mapMachine(
  row: Row & {
    category: CategoryRelation;
    currentDriver: { name: string } | null;
    latestReadingHours: number | null;
    latestReadingAt: string | null;
    busyOnJob: BusyOnJobRow | null;
  },
) {
  const { category, currentDriver, busyOnJob, ...fields } = row;
  const facts = { latestReadingHours: row.latestReadingHours, nextServiceDueHours: row.nextServiceDueHours };
  return Machine.parse({
    ...fields,
    ...projectCategory(category),
    ...projectTimestamps(row),
    currentDriverName: currentDriver?.name ?? null,
    hoursToService: hoursToService(facts),
    serviceDueStatus: serviceDueStatus(facts),
    busyOnJob: busyOnJob
      ? {
          id: busyOnJob.id,
          jobNumber: formatJobNumber(busyOnJob.code),
          customerName: busyOnJob.customerName,
          farmName: busyOnJob.farmName,
          workTypeName: busyOnJob.workTypeName,
          arrivedAt: busyOnJob.arrivedAt,
        }
      : null,
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
    extras: latestReading,
    orderBy: [asc(contractingMachines.code)],
  });
  return rows.map(mapMachine);
}
export async function getMachine({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const row = await db.query.contractingMachines.findFirst({
    where: eq(contractingMachines.id, id),
    with: related,
    extras: latestReading,
  });
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
/** Closing a Service Record prints the sticker: it sets Next Service Due, audited as the Machine's own update. */
export async function stampNextServiceDue({
  db,
  actorUserId,
  machineId,
  nextServiceDueHours,
}: {
  db: DatabaseTransaction;
  actorUserId: AuthId;
  machineId: string;
  nextServiceDueHours: number;
}) {
  return mutateEntity({
    db,
    actorUserId,
    descriptor,
    table: contractingMachines,
    id: machineId,
    notFound: () => notFound('Machine'),
    set: () => ({ nextServiceDueHours, updatedAt: new Date() }),
    summary: 'Next Service Due set by Service Record',
    project: () => undefined,
  });
}
export async function retireMachine(args: { db: Db; actorUserId: AuthId; input: FleetRetireInput }) {
  return retireFleetEntry({
    ...args,
    table: contractingMachines,
    descriptor,
    noun: 'Machine',
    alsoSet: { currentDriverUserId: null },
    assert: async (tx, row) => {
      const [open] = await tx
        .select({ id: contractingServiceRecords.id })
        .from(contractingServiceRecords)
        .where(and(eq(contractingServiceRecords.machineId, row.id), isNull(contractingServiceRecords.closedAt)))
        .limit(1);
      if (open) throw new FleetError('fleet.in_use', 'Close the service this Machine is in for before retiring it.');
    },
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
