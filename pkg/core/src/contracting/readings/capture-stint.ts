import { type DatabaseTransaction, user } from '@pkg/db';
import {
  contractingImplements,
  type contractingJobs,
  contractingMachineAssignments,
  type contractingMachines,
} from '@pkg/db/contracting';
import { isContractingManagement } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import { hasJobStatus, openJobStatuses, type ReadingCaptureInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { recordAuditCreate } from '../../audit/audit-writer.js';
import { assignmentDescriptor } from '../jobs/job-audit.js';
import { lockAssignment, lockJob } from '../jobs/job-lock.js';
import { writeAssignment, writeJobRow } from '../jobs/job-write.js';
import { ReadingError } from './reading-errors.js';

/**
 * The Machine Assignment side of an Hour Reading capture: a planned stint arriving or leaving, or a
 * Foreman starting a stint from the phone. Runs inside the capture's transaction after the Machine lock,
 * so the lock order stays machine → job → stint. Refusals are Reading errors because the phone reports them.
 */

type JobRow = typeof contractingJobs.$inferSelect;
type StintRow = typeof contractingMachineAssignments.$inferSelect;
type MachineRow = typeof contractingMachines.$inferSelect;
export type CaptureStint = { job: JobRow; stint: StintRow };

const stintNotFound = () => new ReadingError('reading.not_found', 'Machine Assignment not found.');
const alreadyArrived = () => new ReadingError('reading.invalid_role', 'This Machine Assignment already arrived.');

async function isManagement(tx: DatabaseTransaction, actorUserId: AuthId) {
  const [actor] = await tx
    .select({ contractingRole: user.contractingRole, equipmentRole: user.role })
    .from(user)
    .where(eq(user.id, actorUserId));
  return isContractingManagement(actor);
}

function assertCanCaptureOn(job: JobRow, actorUserId: AuthId, management: boolean) {
  if (!management && job.foremanUserId !== actorUserId)
    throw new ReadingError('reading.forbidden', 'This is not your Job.');
  if (!hasJobStatus(openJobStatuses, job.status))
    throw new ReadingError('reading.wrong_status', 'This Job is no longer open.');
}

async function lockPlannedStint(
  tx: DatabaseTransaction,
  { actorUserId, input, hasPhoto }: { actorUserId: AuthId; input: ReadingCaptureInput; hasPhoto: boolean },
  assignmentId: string,
): Promise<CaptureStint> {
  const { job, stint } = await lockAssignment(tx, assignmentId, stintNotFound);
  if (stint.machineId !== input.machineId) throw stintNotFound();
  const management = await isManagement(tx, actorUserId);
  if (input.role === 'departure' && management && !hasPhoto && !input.comment)
    throw new ReadingError('reading.invalid_role', 'A reason is required for a photo-less departure reading.');
  assertCanCaptureOn(job, actorUserId, management);
  if (input.role === 'arrival' && stint.arrivalReadingId) throw alreadyArrived();
  if (input.role === 'departure' && (!stint.arrivalReadingId || stint.departureReadingId))
    throw new ReadingError('reading.invalid_role', 'This Machine Assignment is not on site.');
  return { job, stint };
}

/** A Foreman's phone names the new stint's id, so a retried capture finds the stint it already started. */
async function startStint(
  tx: DatabaseTransaction,
  { actorUserId, input, machine }: { actorUserId: AuthId; input: ReadingCaptureInput; machine: MachineRow },
  start: NonNullable<ReadingCaptureInput['startAssignment']>,
): Promise<CaptureStint> {
  const job = await lockJob(tx, start.jobId, () => new ReadingError('reading.not_found', 'Job not found.'));
  assertCanCaptureOn(job, actorUserId, await isManagement(tx, actorUserId));
  const [inserted] = await tx
    .insert(contractingMachineAssignments)
    .values({
      id: start.localId,
      jobId: start.jobId,
      machineId: input.machineId,
      implementId: start.implementId,
      driverUserId: start.driverUserId ?? machine.currentDriverUserId,
      createdByUserId: actorUserId,
    })
    .onConflictDoNothing({ target: contractingMachineAssignments.id })
    .returning();
  const [stint] = inserted
    ? [inserted]
    : await tx
        .select()
        .from(contractingMachineAssignments)
        .where(eq(contractingMachineAssignments.id, start.localId))
        .for('update');
  if (!stint || stint.jobId !== job.id || stint.machineId !== input.machineId)
    throw new ReadingError('reading.capture_id_conflict', 'This Machine Assignment identifier is already used.');
  if (stint.arrivalReadingId) throw alreadyArrived();
  if (inserted)
    await recordAuditCreate({ db: tx, actorUserId, descriptor: assignmentDescriptor(machine.code), input: stint });
  return { job, stint };
}

/** The Implement and Driver an arrival brings: the phone's overrides, else what the stint planned. */
function arrivalResources(stint: StintRow, overrides: ReadingCaptureInput['stintOverrides']) {
  return {
    implementId: overrides?.implementId !== undefined ? overrides.implementId : stint.implementId,
    driverUserId: overrides?.driverUserId !== undefined ? overrides.driverUserId : stint.driverUserId,
  };
}

async function assertArrivalResources(
  tx: DatabaseTransaction,
  { implementId, driverUserId }: ReturnType<typeof arrivalResources>,
) {
  if (implementId) {
    const [implement] = await tx
      .select({ retiredAt: contractingImplements.retiredAt })
      .from(contractingImplements)
      .where(eq(contractingImplements.id, implementId))
      .for('update');
    if (!implement || implement.retiredAt)
      throw new ReadingError('reading.invalid_role', 'The selected Implement is no longer available.');
  }
  if (driverUserId) {
    const [driver] = await tx
      .select({ contractingRole: user.contractingRole, isDevice: user.isDevice })
      .from(user)
      .where(eq(user.id, driverUserId))
      .for('update');
    if (driver?.contractingRole !== 'driver' || driver.isDevice)
      throw new ReadingError('reading.invalid_role', 'Select a person with the Contracting driver role.');
  }
}

/** Finds, or starts, the stint a capture belongs to, and checks the capture may land on it. */
export async function resolveCaptureStint(
  tx: DatabaseTransaction,
  context: { actorUserId: AuthId; input: ReadingCaptureInput; machine: MachineRow; hasPhoto: boolean },
): Promise<CaptureStint | null> {
  const { input } = context;
  const resolved = input.assignmentId
    ? await lockPlannedStint(tx, context, input.assignmentId)
    : input.startAssignment
      ? await startStint(tx, context, input.startAssignment)
      : null;
  if (resolved && input.role === 'arrival')
    await assertArrivalResources(tx, arrivalResources(resolved.stint, input.stintOverrides));
  return resolved;
}

/** Points the stint at its new reading; an arrival also applies the phone's overrides and starts the Job. */
export async function attachReadingToStint(
  tx: DatabaseTransaction,
  {
    actorUserId,
    machineCode,
    input,
    readingId,
    job,
    stint,
  }: CaptureStint & { actorUserId: AuthId; machineCode: string; input: ReadingCaptureInput; readingId: string },
) {
  await writeAssignment(tx, actorUserId, machineCode, stint.id, {
    set: () =>
      input.role === 'arrival'
        ? { arrivalReadingId: readingId, ...arrivalResources(stint, input.stintOverrides) }
        : { departureReadingId: readingId },
  });
  if (input.role === 'arrival' && job.status === 'upcoming')
    await writeJobRow(tx, actorUserId, job.id, { set: () => ({ status: 'active' }) });
}
