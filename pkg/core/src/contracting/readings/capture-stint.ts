import { type DatabaseTransaction, user } from '@pkg/db';
import { contractingImplements, type contractingJobs, type contractingMachineAssignments } from '@pkg/db/contracting';
import { type JobActor, jobTransitions } from '@pkg/domain/contracting';
import type { ReadingCaptureInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { lockAssignment } from '../jobs/job-lock.js';
import { writeAssignment, writeJobRow } from '../jobs/job-write.js';
import { assertReadingJobAction, ReadingError } from './reading-errors.js';

/**
 * The Machine Assignment side of an Hour Reading capture: a planned stint arriving or leaving. Runs inside
 * the capture's transaction after the Machine lock, so the lock order stays machine → job → stint. Refusals
 * are Reading errors because the phone reports them.
 */

type JobRow = typeof contractingJobs.$inferSelect;
type StintRow = typeof contractingMachineAssignments.$inferSelect;
export type CaptureStint = { job: JobRow; stint: StintRow };

const stintNotFound = () => new ReadingError('reading.not_found', 'Machine Assignment not found.');

async function lockPlannedStint(
  tx: DatabaseTransaction,
  { actor, input }: { actor: JobActor; input: ReadingCaptureInput },
  assignmentId: string,
): Promise<CaptureStint> {
  const { job, stint } = await lockAssignment(tx, assignmentId, stintNotFound);
  if (stint.machineId !== input.machineId) throw stintNotFound();
  assertReadingJobAction('capture', job, actor);
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

/** Finds the stint a capture belongs to, and checks the actor may capture on its Job. */
export async function resolveCaptureStint(
  tx: DatabaseTransaction,
  context: { actor: JobActor; input: ReadingCaptureInput },
): Promise<CaptureStint | null> {
  const { input } = context;
  const resolved = input.assignmentId ? await lockPlannedStint(tx, context, input.assignmentId) : null;
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
    await writeJobRow(tx, actor.userId, job.id, { set: (before) => jobTransitions.activate(before) });
}
