import { type DatabaseTransaction, user } from '@pkg/db';
import { contractingImplements, type contractingJobs, type contractingMachineAssignments } from '@pkg/db/contracting';
import { type JobActor, jobTransitions, judgeJobAction } from '@pkg/domain/contracting';
import type { JobActionVerdict, ReadingCaptureInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { lockAssignment } from '../jobs/job-lock.js';
import { writeAssignment, writeJobRow } from '../jobs/job-write.js';
import { ReadingError } from './reading-errors.js';

/**
 * The Machine Assignment side of an Hour Reading capture: a planned stint arriving or leaving. Runs inside
 * the capture's transaction after the Machine lock, so the lock order stays machine → job → stint. It gathers
 * facts for `judgeCapture` and refuses nothing itself, beyond an Assignment that does not exist.
 */

type JobRow = typeof contractingJobs.$inferSelect;
type StintRow = typeof contractingMachineAssignments.$inferSelect;
export type CaptureStint = { job: JobRow; stint: StintRow };
/** A stint plus what the judgement reads off it: the Job's verdict, and the arrival's Implement and Driver. */
export type ResolvedCaptureStint = CaptureStint & {
  jobVerdict: JobActionVerdict;
  implementValid: boolean;
  driverValid: boolean;
};

const stintNotFound = () => new ReadingError('reading.not_found', 'Machine Assignment not found.');

/** The Implement and Driver an arrival brings: the phone's overrides, else what the stint planned. */
function arrivalResources(stint: StintRow, overrides: ReadingCaptureInput['stintOverrides']) {
  return {
    implementId: overrides?.implementId !== undefined ? overrides.implementId : stint.implementId,
    driverUserId: overrides?.driverUserId !== undefined ? overrides.driverUserId : stint.driverUserId,
  };
}

/** The Implement and Driver an arrival names, as facts for the judgement; each true when none is named. */
async function arrivalResourceFacts(
  tx: DatabaseTransaction,
  { implementId, driverUserId }: ReturnType<typeof arrivalResources>,
) {
  let implementValid = true;
  if (implementId) {
    const [implement] = await tx
      .select({ retiredAt: contractingImplements.retiredAt })
      .from(contractingImplements)
      .where(eq(contractingImplements.id, implementId))
      .for('update');
    implementValid = !!implement && !implement.retiredAt;
  }
  let driverValid = true;
  if (driverUserId) {
    const [driver] = await tx
      .select({ contractingRole: user.contractingRole, isDevice: user.isDevice })
      .from(user)
      .where(eq(user.id, driverUserId))
      .for('update');
    driverValid = driver?.contractingRole === 'driver' && !driver.isDevice;
  }
  return { implementValid, driverValid };
}

/** Finds the stint a capture lands on, with the Job's verdict on capturing there; refuses nothing itself. */
export async function resolveCaptureStint(
  tx: DatabaseTransaction,
  { actor, input }: { actor: JobActor; input: ReadingCaptureInput },
): Promise<ResolvedCaptureStint | null> {
  if (!input.assignmentId) return null;
  const { job, stint } = await lockAssignment(tx, input.assignmentId, stintNotFound);
  if (stint.machineId !== input.machineId) throw stintNotFound();
  const resources =
    input.role === 'arrival'
      ? await arrivalResourceFacts(tx, arrivalResources(stint, input.stintOverrides))
      : { implementValid: true, driverValid: true };
  return { job, stint, jobVerdict: judgeJobAction('capture', job, actor), ...resources };
}

/**
 * Points the stint at its new reading; an arrival also applies the phone's overrides and starts the Job, stamped
 * with the instant the server accepted the reading (never its Read At, which may be backdated).
 */
export async function attachReadingToStint(
  tx: DatabaseTransaction,
  {
    actor,
    machineCode,
    input,
    readingId,
    acceptedAt,
    job,
    stint,
  }: CaptureStint & {
    actor: JobActor;
    machineCode: string;
    input: ReadingCaptureInput;
    readingId: string;
    acceptedAt: Date;
  },
) {
  await writeAssignment(tx, actor.userId, machineCode, stint.id, () =>
    input.role === 'arrival'
      ? { arrivalReadingId: readingId, ...arrivalResources(stint, input.stintOverrides) }
      : { departureReadingId: readingId },
  );
  if (input.role === 'arrival' && job.status === 'upcoming')
    await writeJobRow(tx, actor.userId, job.id, (before) =>
      jobTransitions.activate(before, { at: acceptedAt, byUserId: actor.userId }),
    );
}
