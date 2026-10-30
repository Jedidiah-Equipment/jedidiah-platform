import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import { contractingImplements, contractingMachineAssignments } from '@pkg/db/contracting';
import {
  assignmentState,
  HOURS_EDIT_REASON_REQUIRED,
  hoursEditNeedsReason,
  type JobActor,
  jobTransitions,
  judgeStintHours,
  snapshotTravelHours,
} from '@pkg/domain/contracting';
import type {
  StintHoursCaptureInput,
  StintHoursEditInput,
  StintOverrides,
  TravelHoursSetInput,
} from '@pkg/schema/contracting';
import { and, desc, eq, isNotNull, lt, ne } from 'drizzle-orm';
import { serviceDueSoonEdge } from '../fleet/machine-service.js';
import { latestTelematicsReading } from '../readings/telematics-reading.js';
import { assertStintAction, JobError, wrongStatus } from './job-errors.js';
import { lockAssignment, lockAssignmentWithMachine } from './job-lock.js';
import { jobTransaction, writeAssignment, writeJobRow } from './job-write.js';
import { reopenPricingWithin } from './pricing-service.js';

/*
 * Job Hours: the arrival and departure meter values a Machine Assignment holds. The one rule is departure ≥ arrival;
 * nothing here reads a Read At, another stint's hours against these, or the ledger, beyond the John Deere snapshot.
 */

type StintRow = typeof contractingMachineAssignments.$inferSelect;

/** `serviceDueSoonCrossed` is true when the write took the Machine into Service Due Soon; the caller pushes after commit. */
export type StintHoursWrite = { machineId: string; serviceDueSoonCrossed: boolean };

/** What John Deere had last read for this Machine when the hours were saved, as the stint stores it. */
const snapshotColumns = (side: 'arrival' | 'departure', telematics: { hours: number; at: Date } | null) =>
  side === 'arrival'
    ? { arrivalTelematicsHours: telematics?.hours ?? null, arrivalTelematicsAt: telematics?.at ?? null }
    : { departureTelematicsHours: telematics?.hours ?? null, departureTelematicsAt: telematics?.at ?? null };

/** Travel as an arrival snapshots it: against the Machine's last departure on any other stint, before `before` when given. */
async function travelSnapshot(tx: DatabaseTransaction, stint: StintRow, arrivalHours: number, before?: Date) {
  const [previous] = await tx
    .select({ departureHours: contractingMachineAssignments.departureHours })
    .from(contractingMachineAssignments)
    .where(
      and(
        eq(contractingMachineAssignments.machineId, stint.machineId),
        ne(contractingMachineAssignments.id, stint.id),
        isNotNull(contractingMachineAssignments.departureAt),
        before ? lt(contractingMachineAssignments.departureAt, before) : undefined,
      ),
    )
    .orderBy(desc(contractingMachineAssignments.departureAt))
    .limit(1);
  const { travelHours, clamped } = snapshotTravelHours(arrivalHours, previous?.departureHours ?? null);
  return { travelHours, travelClamped: clamped };
}

/** The Implement and Driver an arrival brings: the phone's overrides, else what the stint planned. */
function arrivalResources(stint: StintRow, overrides: StintOverrides | undefined) {
  return {
    implementId: overrides?.implementId !== undefined ? overrides.implementId : stint.implementId,
    driverUserId: overrides?.driverUserId !== undefined ? overrides.driverUserId : stint.driverUserId,
  };
}

/** Refuses an arrival's Implement or Driver that is no longer valid. */
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
      throw new JobError('contracting_job.invalid_reference', 'The selected Implement is no longer available.');
  }
  if (driverUserId) {
    const [driver] = await tx
      .select({ contractingRole: user.contractingRole, isDevice: user.isDevice })
      .from(user)
      .where(eq(user.id, driverUserId))
      .for('update');
    if (driver?.contractingRole !== 'driver' || driver.isDevice)
      throw new JobError('contracting_job.invalid_driver', 'Select a person with the Contracting driver role.');
  }
}

function assertDepartureAfterArrival(arrival: number, departure: number | null) {
  const verdict = judgeStintHours({ arrival, departure });
  if (!verdict.ok) throw new JobError(verdict.refusal.code, verdict.refusal.message);
}

/**
 * Captures a stint's arrival or departure hours. An arrival snapshots Travel and John Deere, applies the phone's
 * Implement and Driver, and starts an Upcoming Job. A retry of a capture already landed, with the same hours by the
 * same person, returns without writing.
 */
export async function captureStintHours({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: StintHoursCaptureInput;
}): Promise<StintHoursWrite> {
  return jobTransaction(db, async (tx) => {
    const { job, stint, machine, machineCode } = await lockAssignmentWithMachine(tx, input.assignmentId);
    const arrival = input.role === 'arrival';
    const landed = arrival
      ? stint.arrivalHours === input.hours && stint.arrivalByUserId === actor.userId
      : stint.departureHours === input.hours && stint.departureByUserId === actor.userId;
    if (landed && assignmentState(stint) !== (arrival ? 'planned' : 'on-site'))
      return { machineId: machine.id, serviceDueSoonCrossed: false };
    assertStintAction(arrival ? 'captureArrival' : 'captureDeparture', job, stint, actor);
    const now = new Date();
    const edge = await serviceDueSoonEdge(tx, machine);
    const comment = input.comment ?? null;
    if (arrival) {
      const resources = arrivalResources(stint, input.stintOverrides);
      await assertArrivalResources(tx, resources);
      const [telematics, travel] = await Promise.all([
        latestTelematicsReading(tx, machine.id),
        travelSnapshot(tx, stint, input.hours),
      ]);
      await writeAssignment(tx, actor.userId, machineCode, stint.id, () => ({
        ...resources,
        arrivalHours: input.hours,
        arrivalAt: now,
        arrivalByUserId: actor.userId,
        arrivalComment: comment,
        ...snapshotColumns('arrival', telematics),
        ...travel,
      }));
      if (job.status === 'upcoming')
        await writeJobRow(tx, actor.userId, job.id, (before) =>
          jobTransitions.activate(before, { at: now, byUserId: actor.userId }),
        );
    } else {
      assertDepartureAfterArrival(stint.arrivalHours ?? 0, input.hours);
      const telematics = await latestTelematicsReading(tx, machine.id);
      await writeAssignment(tx, actor.userId, machineCode, stint.id, () => ({
        departureHours: input.hours,
        departureAt: now,
        departureByUserId: actor.userId,
        departureComment: comment,
        ...snapshotColumns('departure', telematics),
      }));
    }
    return { machineId: machine.id, serviceDueSoonCrossed: await edge.crossed() };
  });
}

/**
 * Edits a stint's Job Hours and their comments. A reason is required once the Job has a Job Card, and stamps the
 * amendment; an arrival that moves recomputes Travel until it was set by hand; a Priced Job returns to Completed.
 */
export async function editStintHours({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: StintHoursEditInput;
}): Promise<StintHoursWrite> {
  return jobTransaction(db, async (tx) => {
    const { job, stint, machine, machineCode } = await lockAssignmentWithMachine(tx, input.assignmentId);
    assertStintAction('editHours', job, stint, actor);
    const reason = input.reason?.trim() || null;
    if (hoursEditNeedsReason(job.status) && !reason)
      throw new JobError('contracting_job.reason_required', HOURS_EDIT_REASON_REQUIRED);
    if (stint.departureHours !== null && input.departureHours === null)
      throw wrongStatus('A captured departure cannot be cleared.');
    if (stint.departureHours === null && input.departureHours !== null)
      throw wrongStatus('Capture the departure to record it.');
    assertDepartureAfterArrival(input.arrivalHours, input.departureHours);
    const arrivalMoved = input.arrivalHours !== stint.arrivalHours;
    const departureMoved = input.departureHours !== stint.departureHours;
    const arrivalComment = input.arrivalComment === undefined ? stint.arrivalComment : input.arrivalComment;
    const departureComment = input.departureComment === undefined ? stint.departureComment : input.departureComment;
    const changed =
      arrivalMoved ||
      departureMoved ||
      arrivalComment !== stint.arrivalComment ||
      departureComment !== stint.departureComment;
    if (!changed) return { machineId: machine.id, serviceDueSoonCrossed: false };
    const now = new Date();
    const edge = await serviceDueSoonEdge(tx, machine);
    const [telematics, travel] = await Promise.all([
      arrivalMoved || departureMoved ? latestTelematicsReading(tx, machine.id) : null,
      arrivalMoved && stint.travelSetAt === null && stint.arrivalAt
        ? travelSnapshot(tx, stint, input.arrivalHours, stint.arrivalAt)
        : {},
    ]);
    await writeAssignment(tx, actor.userId, machineCode, stint.id, () => ({
      arrivalHours: input.arrivalHours,
      arrivalComment,
      departureHours: input.departureHours,
      departureComment,
      ...(arrivalMoved ? snapshotColumns('arrival', telematics) : {}),
      ...(departureMoved ? snapshotColumns('departure', telematics) : {}),
      ...travel,
      ...(reason ? { hoursAmendedAt: now, hoursAmendedByUserId: actor.userId, hoursAmendmentReason: reason } : {}),
    }));
    if (job.status === 'priced' && (arrivalMoved || departureMoved))
      await reopenPricingWithin(tx, actor.userId, job.id, `Job hours edited on ${machineCode} — amounts recomputed.`);
    return { machineId: machine.id, serviceDueSoonCrossed: await edge.crossed() };
  });
}

/** Sets a stint's Travel Hours by hand; nothing recalculates them after. A Priced Job returns to Completed. */
export async function setTravelHours({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: TravelHoursSetInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const { job, stint, machineCode } = await lockAssignment(tx, input.assignmentId);
    assertStintAction('setTravel', job, stint, actor);
    await writeAssignment(tx, actor.userId, machineCode, stint.id, () => ({
      travelHours: input.travelHours,
      travelClamped: false,
      travelSetAt: new Date(),
      travelSetByUserId: actor.userId,
    }));
    if (job.status === 'priced' && input.travelHours !== stint.travelHours)
      await reopenPricingWithin(tx, actor.userId, job.id, `Travel Hours set on ${machineCode} — amounts recomputed.`);
  });
}
