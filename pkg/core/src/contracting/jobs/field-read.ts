import { type Db, user } from '@pkg/db';
import { type contractingHourReadings, contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { hasPermission } from '@pkg/domain';
import { assignmentState, formatJobNumber } from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import { FieldDriver, FieldJob, FieldReading, FieldStint } from '@pkg/schema/contracting';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { JobError, jobNotFound } from './job-errors.js';

function fieldReadMode(actor: UserAccessSummary): 'all' | 'own' {
  if (hasPermission(actor, 'contracting_job:read-own')) return 'own';
  if (
    actor.equipmentRole === 'super-admin' ||
    actor.contractingRole === 'contracting-admin' ||
    actor.contractingRole === 'contracting-manager'
  )
    return 'all';
  throw new JobError('contracting_job.not_owner', 'You do not have access to field Jobs.');
}

const fieldRelations = {
  assignments: {
    orderBy: [asc(contractingMachineAssignments.createdAt)],
    with: {
      arrivalReading: true,
      departureReading: true,
      driver: { columns: { name: true } },
      implement: { columns: { code: true } },
      machine: { columns: { code: true }, with: { category: true } },
    },
  },
  customer: { columns: { name: true } },
  farm: { columns: { name: true } },
  workType: { columns: { name: true } },
} as const;

type LoadedFieldJob = typeof contractingJobs.$inferSelect & {
  assignments: Array<
    typeof contractingMachineAssignments.$inferSelect & {
      arrivalReading: typeof contractingHourReadings.$inferSelect | null;
      departureReading: typeof contractingHourReadings.$inferSelect | null;
      driver: { name: string } | null;
      implement: { code: string } | null;
      machine: { code: string; category: { name: string; icon: string; colour: string } };
    }
  >;
  customer: { name: string };
  farm: { name: string };
  workType: { name: string };
};

function mapReading(reading: typeof contractingHourReadings.$inferSelect | null) {
  return reading
    ? FieldReading.parse({
        ...reading,
        capturedAt: reading.capturedAt.toISOString(),
        photoBacked: reading.photo !== null,
      })
    : null;
}

function mapFieldJob(row: LoadedFieldJob) {
  return FieldJob.parse({
    ...row,
    jobNumber: formatJobNumber(row.code),
    customerName: row.customer.name,
    farmName: row.farm.name,
    workTypeName: row.workType.name,
    stints: row.assignments.map((stint) =>
      FieldStint.parse({
        ...stint,
        machineCode: stint.machine.code,
        categoryName: stint.machine.category.name,
        categoryIcon: stint.machine.category.icon,
        categoryColour: stint.machine.category.colour,
        implementCode: stint.implement?.code ?? null,
        driverName: stint.driver?.name ?? null,
        state: assignmentState(stint),
        arrival: mapReading(stint.arrivalReading),
        departure: mapReading(stint.departureReading),
        createdAt: stint.createdAt.toISOString(),
      }),
    ),
  });
}

function loadFieldJob(db: Db, id: string) {
  const query = db.query.contractingJobs as unknown as {
    findFirst(config: unknown): Promise<LoadedFieldJob | undefined>;
  };
  return query.findFirst({ where: eq(contractingJobs.id, id), with: fieldRelations });
}

export async function listFieldJobs({ db, actor }: { db: Db; actor: UserAccessSummary }) {
  const mode = fieldReadMode(actor);
  const query = db.query.contractingJobs as unknown as {
    findMany(config: unknown): Promise<LoadedFieldJob[]>;
  };
  const rows = await query.findMany({
    where: and(
      inArray(contractingJobs.status, ['upcoming', 'active']),
      mode === 'own' ? eq(contractingJobs.foremanUserId, actor.userId) : undefined,
    ),
    with: fieldRelations,
    orderBy: [asc(contractingJobs.code)],
  });
  return rows.map(mapFieldJob);
}

export async function getFieldJob({ db, actor, id }: { db: Db; actor: UserAccessSummary; id: string }) {
  const mode = fieldReadMode(actor);
  const row = await loadFieldJob(db, id);
  if (!row) throw jobNotFound();
  if (mode === 'own' && row.foremanUserId !== actor.userId)
    throw new JobError('contracting_job.not_owner', 'This Job is assigned to another Foreman.');
  if (!['upcoming', 'active'].includes(row.status))
    throw new JobError('contracting_job.wrong_status', 'This Job is no longer open.');
  return mapFieldJob(row);
}

export async function listFieldDrivers({ db }: { db: Db }) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.contractingRole, 'driver'))
    .orderBy(asc(user.name))
    .then((rows) => rows.map((row) => FieldDriver.parse(row)));
}
