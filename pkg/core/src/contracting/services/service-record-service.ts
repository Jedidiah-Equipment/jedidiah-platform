import {
  createGlobalSearchCondition,
  type DatabaseTransaction,
  type Db,
  getSortOrder,
  paginateWithWindowTotal,
  user,
} from '@pkg/db';
import { contractingCategories, contractingMachines, contractingServiceRecords } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import {
  NEXT_SERVICE_DUE_BELOW_READING_MESSAGE,
  ServiceRecord,
  type ServiceRecordCloseInput,
  ServiceRecordFilterOptions,
  type ServiceRecordListInput,
  type ServiceRecordListResult,
  type ServiceRecordOpenInput,
  type ServiceRecordPatchInput,
} from '@pkg/schema/contracting';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { defineAuditDescriptor, recordAuditCreate } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { projectCategory } from '../fleet/fleet-entry.js';
import { stampNextServiceDue } from '../fleet/machine-service.js';
import { assertContractingMechanic } from '../mechanics.js';
import {
  invalidServiceMechanic,
  ServiceError,
  serviceRecordNotFound,
  withServiceConstraints,
} from './service-errors.js';
import { serviceRecordStatusCondition } from './service-record-status.js';

type Row = typeof contractingServiceRecords.$inferSelect;
const descriptor = defineAuditDescriptor<Row>({
  entityType: 'contracting_service_record',
  noun: 'Service Record',
  primaryLabelField: 'startDate',
  entityId: (row) => row.id,
  toRecord: ({ id: _id, createdAt: _created, updatedAt: _updated, ...row }) => ({
    ...row,
    closedAt: row.closedAt?.toISOString() ?? null,
  }),
});

const serviceMechanic = alias(user, 'service_mechanic');
const serviceCloser = alias(user, 'service_closer');
/** Every Service Record read: the row with its Machine, the Machine's Category and the people it names. */
function selectServiceRecords(db: Db | DatabaseTransaction) {
  return db
    .select({
      record: contractingServiceRecords,
      machineCode: contractingMachines.code,
      category: {
        name: contractingCategories.name,
        icon: contractingCategories.icon,
        colour: contractingCategories.colour,
      },
      mechanicName: serviceMechanic.name,
      closedByName: serviceCloser.name,
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(contractingServiceRecords)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingServiceRecords.machineId))
    .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
    .leftJoin(serviceMechanic, eq(serviceMechanic.id, contractingServiceRecords.primaryMechanicUserId))
    .leftJoin(serviceCloser, eq(serviceCloser.id, contractingServiceRecords.closedByUserId))
    .$dynamic();
}
type LoadedRow = Awaited<ReturnType<typeof selectServiceRecords>>[number];
function mapServiceRecord({ record, machineCode, category, mechanicName, closedByName }: LoadedRow) {
  const { closedByUserId: _closedBy, createdByUserId: _createdBy, ...row } = record;
  return ServiceRecord.parse({
    ...row,
    machineCode,
    ...projectCategory(category),
    mechanicName,
    closedByName,
    status: row.closedAt ? 'closed' : 'open',
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function getServiceRecord({ db, id }: { db: Db | DatabaseTransaction; id: string }) {
  const [row] = await selectServiceRecords(db).where(eq(contractingServiceRecords.id, id)).limit(1);
  if (!row) throw serviceRecordNotFound();
  return mapServiceRecord(row);
}

/** Service Records across the fleet, Booked In first, then by start date: the Services table and each Machine's. */
export async function listServiceRecords({
  db,
  input,
}: {
  db: Db;
  input: ServiceRecordListInput;
}): Promise<ServiceRecordListResult> {
  const where = and(
    input.statuses.length ? or(...input.statuses.map(serviceRecordStatusCondition)) : undefined,
    input.machineIds.length ? inArray(contractingServiceRecords.machineId, input.machineIds) : undefined,
    input.mechanicUserIds.length
      ? inArray(contractingServiceRecords.primaryMechanicUserId, input.mechanicUserIds)
      : undefined,
    createGlobalSearchCondition(input.search, [sql`${contractingMachines.code}`, sql`${serviceMechanic.name}`]),
  );
  const matching = () =>
    selectServiceRecords(db)
      .where(where)
      .orderBy(
        asc(serviceRecordStatusCondition('closed')),
        getSortOrder(contractingServiceRecords.startDate, input.sortDirection),
        desc(contractingServiceRecords.createdAt),
        asc(contractingServiceRecords.id),
      );
  const { rows, total, nextCursor } = await paginateWithWindowTotal(matching, input);
  const items = rows.map(mapServiceRecord);
  return { items, nextCursor, total };
}

/** The Machines and Mechanics some Service Record names, for the Services table's column filters. */
export async function listServiceRecordFilterOptions({ db }: { db: Db }): Promise<ServiceRecordFilterOptions> {
  const [machines, mechanics] = await Promise.all([
    db
      .selectDistinct({ id: contractingMachines.id, code: contractingMachines.code })
      .from(contractingServiceRecords)
      .innerJoin(contractingMachines, eq(contractingMachines.id, contractingServiceRecords.machineId))
      .orderBy(asc(contractingMachines.code)),
    db
      .selectDistinct({ id: serviceMechanic.id, name: serviceMechanic.name })
      .from(contractingServiceRecords)
      .innerJoin(serviceMechanic, eq(serviceMechanic.id, contractingServiceRecords.primaryMechanicUserId))
      .orderBy(asc(serviceMechanic.name)),
  ]);
  return ServiceRecordFilterOptions.parse({ machines, mechanics });
}

/** Locks the Machine first, as every Service Record write that touches it must, and refuses a retired one. */
async function lockActiveMachine(tx: DatabaseTransaction, machineId: string) {
  const [machine] = await tx
    .select({ retiredAt: contractingMachines.retiredAt })
    .from(contractingMachines)
    .where(eq(contractingMachines.id, machineId))
    .for('update');
  if (!machine) throw new ServiceError('service.not_found', 'Machine not found.');
  if (machine.retiredAt) throw new ServiceError('service.retired_machine', 'This Machine is retired.');
}

async function assertMechanic(tx: DatabaseTransaction, userId: AuthId | null | undefined) {
  if (userId) await assertContractingMechanic(tx, userId, invalidServiceMechanic);
}

const assertOpen = (before: Row) => {
  if (before.closedAt) throw new ServiceError('service.closed', 'This service is closed, so it can no longer change.');
};

/** Books a Machine in for a service. */
export async function openServiceRecord({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ServiceRecordOpenInput;
}) {
  return withServiceConstraints(() =>
    db.transaction(async (tx) => {
      await lockActiveMachine(tx, input.machineId);
      await assertMechanic(tx, input.primaryMechanicUserId);
      const [row] = await tx
        .insert(contractingServiceRecords)
        .values({
          machineId: input.machineId,
          startDate: input.startDate,
          primaryMechanicUserId: input.primaryMechanicUserId ?? null,
          notes: input.notes,
          createdByUserId: actorUserId,
        })
        .returning();
      if (!row) throw new Error('Service Record insert returned no row');
      await recordAuditCreate({ db: tx, actorUserId, descriptor, input: row });
      return getServiceRecord({ db: tx, id: row.id });
    }),
  );
}

export async function patchServiceRecord({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ServiceRecordPatchInput;
}) {
  return withServiceConstraints(() =>
    mutateEntity({
      db,
      actorUserId,
      descriptor,
      table: contractingServiceRecords,
      id: input.id,
      notFound: serviceRecordNotFound,
      assert: async (tx, before) => {
        assertOpen(before);
        if (input.primaryMechanicUserId !== undefined && input.primaryMechanicUserId !== before.primaryMechanicUserId)
          await assertMechanic(tx, input.primaryMechanicUserId);
      },
      set: (before) => ({
        startDate: input.startDate ?? before.startDate,
        primaryMechanicUserId:
          input.primaryMechanicUserId === undefined ? before.primaryMechanicUserId : input.primaryMechanicUserId,
        notes: input.notes === undefined ? before.notes : input.notes,
        updatedAt: new Date(),
      }),
      project: (tx, row) => getServiceRecord({ db: tx, id: row.id }),
    }),
  );
}

/**
 * Closes a service and prints the sticker in one transaction: the record takes the reading at service and
 * the Next Service Due that was set, and the Machine takes that Next Service Due. Lock order machine → record.
 */
export async function closeServiceRecord({
  db,
  actorUserId,
  input,
  now = new Date(),
}: {
  db: Db;
  actorUserId: AuthId;
  input: ServiceRecordCloseInput;
  now?: Date;
}) {
  if (input.nextServiceDueHours < input.readingAtServiceHours)
    throw new ServiceError('service.invalid_close', NEXT_SERVICE_DUE_BELOW_READING_MESSAGE);
  return withServiceConstraints(() =>
    db.transaction(async (tx) => {
      const [target] = await tx
        .select({ machineId: contractingServiceRecords.machineId })
        .from(contractingServiceRecords)
        .where(eq(contractingServiceRecords.id, input.id));
      if (!target) throw serviceRecordNotFound();
      await lockActiveMachine(tx, target.machineId);
      const record = await mutateEntity({
        db: tx,
        actorUserId,
        descriptor,
        table: contractingServiceRecords,
        id: input.id,
        notFound: serviceRecordNotFound,
        assert: async (lockedTx, before) => {
          assertOpen(before);
          if (input.endDate < before.startDate)
            throw new ServiceError('service.invalid_close', 'The end date cannot be before the start date.');
          // A Mechanic already on the record stays acceptable after a role change; only a new one is checked.
          if (input.primaryMechanicUserId !== before.primaryMechanicUserId)
            await assertMechanic(lockedTx, input.primaryMechanicUserId);
        },
        set: () => ({
          endDate: input.endDate,
          readingAtServiceHours: input.readingAtServiceHours,
          primaryMechanicUserId: input.primaryMechanicUserId,
          notes: input.notes,
          nextServiceDueHoursSet: input.nextServiceDueHours,
          closedAt: now,
          closedByUserId: actorUserId,
          updatedAt: now,
        }),
        project: (lockedTx, row) => getServiceRecord({ db: lockedTx, id: row.id }),
      });
      await stampNextServiceDue({
        db: tx,
        actorUserId,
        machineId: target.machineId,
        nextServiceDueHours: input.nextServiceDueHours,
      });
      return record;
    }),
  );
}
