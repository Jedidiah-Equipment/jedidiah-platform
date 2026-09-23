import { type DatabaseTransaction, user } from '@pkg/db';
import {
  contractingImplements,
  type contractingJobs,
  contractingMachineAssignments,
  type contractingMachines,
} from '@pkg/db/contracting';
import {
  isContractingManagement,
  type JobActor,
  jobActionRefusal,
  judgeJobAction,
  transitionJob,
} from '@pkg/domain/contracting';
import type { ReadingCaptureInput } from '@pkg/schema/contracting';
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

/** The capture Job Action, refused as a Reading error because the phone reports it. */
function assertCanCaptureOn(job: JobRow, actor: JobActor) {
  const verdict = judgeJobAction('capture', job, actor);
  if (verdict.allowed) return;
  const forbidden = verdict.reason === 'no-permission' || verdict.reason === 'not-your-job';
  throw new ReadingError(
    forbidden ? 'reading.forbidden' : 'reading.wrong_status',
    jobActionRefusal('capture', verdict.reason, job, actor),
    { action: 'capture', reason: verdict.reason },
  );
}

async function lockPlannedStint(
  tx: DatabaseTransaction,
  { actor, input, hasPhoto }: { actor: JobActor; input: ReadingCaptureInput; hasPhoto: boolean },
  assignmentId: string,
): Promise<CaptureStint> {
  const { job, stint } = await lockAssignment(tx, assignmentId, stintNotFound);
  if (stint.machineId !== input.machineId) throw stintNotFound();
  if (input.role === 'departure' && isContractingManagement(actor) && !hasPhoto && !input.comment)
    throw new ReadingError('reading.invalid_role', 'A reason is required for a photo-less departure reading.');
  assertCanCaptureOn(job, actor);
  if (input.role === 'arrival' && stint.arrivalReadingId) throw alreadyArrived();
  if (input.role === 'departure' && (!stint.arrivalReadingId || stint.departureReadingId))
    throw new ReadingError('reading.invalid_role', 'This Machine Assignment is not on site.');
  return { job, stint };
}

/** A Foreman's phone names the new stint's id, so a retried capture finds the stint it already started. */
async function startStint(
  tx: DatabaseTransaction,
  { actor, input, machine }: { actor: JobActor; input: ReadingCaptureInput; machine: MachineRow },
  start: NonNullable<ReadingCaptureInput['startAssignment']>,
): Promise<CaptureStint> {
  const job = await lockJob(tx, start.jobId, () => new ReadingError('reading.not_found', 'Job not found.'));
  assertCanCaptureOn(job, actor);
  const [inserted] = await tx
    .insert(contractingMachineAssignments)
    .values({
      id: start.localId,
      jobId: start.jobId,
      machineId: input.machineId,
      implementId: start.implementId,
      driverUserId: start.driverUserId ?? machine.currentDriverUserId,
      createdByUserId: actor.userId,
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
    await recordAuditCreate({
      db: tx,
      actorUserId: actor.userId,
      descriptor: assignmentDescriptor(machine.code),
      input: stint,
    });
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
  context: { actor: JobActor; input: ReadingCaptureInput; machine: MachineRow; hasPhoto: boolean },
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
    actor,
    machineCode,
    input,
    readingId,
    job,
    stint,
  }: CaptureStint & { actor: JobActor; machineCode: string; input: ReadingCaptureInput; readingId: string },
) {
  await writeAssignment(tx, actor.userId, machineCode, stint.id, {
    set: () =>
      input.role === 'arrival'
        ? { arrivalReadingId: readingId, ...arrivalResources(stint, input.stintOverrides) }
        : { departureReadingId: readingId },
  });
  if (input.role === 'arrival' && job.status === 'upcoming')
    await writeJobRow(tx, actor.userId, job.id, { set: (before) => transitionJob(before, { type: 'activate' }) });
}
