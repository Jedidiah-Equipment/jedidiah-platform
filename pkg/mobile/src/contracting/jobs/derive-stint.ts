import {
  type FieldDriver,
  type FieldImplement,
  type FieldJob,
  type FieldMachine,
  FieldStint,
} from '@pkg/schema/contracting';
import type { QueuedReading } from '@/contracting/readings/reading-queue';

export type StintView = FieldStint & {
  view: 'planned' | 'starting' | 'running' | 'stopping' | 'left' | 'attention';
  queued: QueuedReading | undefined;
};

function capturesFor(stintId: string, queued: readonly QueuedReading[]) {
  return queued.filter((capture) => capture.assignmentId === stintId || capture.startAssignment?.localId === stintId);
}

type StintLookups = {
  implements?: readonly FieldImplement[];
  drivers?: readonly FieldDriver[];
};

function withQueuedOverrides(stint: FieldStint, arrival: QueuedReading | undefined, lookups: StintLookups) {
  const overrides = arrival?.stintOverrides;
  if (!overrides) return stint;
  const implementId = overrides.implementId === undefined ? stint.implementId : overrides.implementId;
  const driverUserId = overrides.driverUserId === undefined ? stint.driverUserId : overrides.driverUserId;
  return {
    ...stint,
    implementId,
    implementCode:
      implementId === stint.implementId
        ? stint.implementCode
        : (lookups.implements?.find((row) => row.id === implementId)?.code ?? null),
    driverUserId,
    driverName:
      driverUserId === stint.driverUserId
        ? stint.driverName
        : (lookups.drivers?.find((row) => row.id === driverUserId)?.name ?? null),
  };
}

export function deriveStint(
  stint: FieldStint,
  queued: readonly QueuedReading[],
  lookups: StintLookups = {},
): StintView {
  const mine = capturesFor(stint.id, queued);
  const arrival = mine.find((capture) => capture.role === 'arrival');
  const projected = withQueuedOverrides(stint, arrival, lookups);
  const attention = mine.find((capture) => capture.attention);
  if (attention) return { ...projected, view: 'attention', queued: attention };
  const departure = mine.find((capture) => capture.role === 'departure');
  if (stint.state === 'left') return { ...projected, view: 'left', queued: undefined };
  if (stint.state === 'on-site')
    return departure
      ? { ...projected, view: 'stopping', queued: departure }
      : { ...projected, view: 'running', queued: undefined };
  if (!arrival) return { ...projected, view: 'planned', queued: undefined };
  return departure
    ? { ...projected, view: 'stopping', queued: departure }
    : { ...projected, view: 'starting', queued: arrival };
}

export function queuedUnplannedStints(
  jobId: string,
  queued: readonly QueuedReading[],
  fleet: readonly FieldMachine[],
  implementRows: readonly FieldImplement[],
  driverRows: readonly FieldDriver[],
): StintView[] {
  return queued.flatMap((capture) => {
    const start = capture.startAssignment;
    if (!start || start.jobId !== jobId || capture.role !== 'arrival') return [];
    const machine = fleet.find((candidate) => candidate.id === capture.machineId);
    if (!machine) return [];
    const attached = start.implementId
      ? implementRows.find((candidate) => candidate.id === start.implementId)
      : undefined;
    return [
      deriveStint(
        FieldStint.parse({
          id: start.localId,
          jobId,
          machineId: machine.id,
          machineCode: machine.code,
          categoryName: machine.categoryName,
          categoryIcon: machine.categoryIcon,
          categoryColour: machine.categoryColour,
          implementId: start.implementId,
          implementCode: attached?.code ?? null,
          driverUserId: start.driverUserId ?? machine.currentDriverUserId,
          driverName:
            start.driverUserId === undefined || start.driverUserId === machine.currentDriverUserId
              ? machine.currentDriverName
              : (driverRows.find((candidate) => candidate.id === start.driverUserId)?.name ?? null),
          state: 'planned',
          arrival: null,
          departure: null,
          createdAt: capture.capturedAt,
        }),
        queued,
        { implements: implementRows, drivers: driverRows },
      ),
    ];
  });
}

export function jobSummary(job: FieldJob, queued: readonly QueuedReading[]) {
  const stintIds = new Set(job.stints.map((stint) => stint.id));
  const server = job.stints.map((stint) => deriveStint(stint, queued));
  const local = queued
    .filter(
      (capture) =>
        capture.role === 'arrival' &&
        capture.startAssignment?.jobId === job.id &&
        !stintIds.has(capture.startAssignment.localId),
    )
    .map((arrival) => {
      const departure = queued.find(
        (capture) => capture.role === 'departure' && capture.assignmentId === arrival.startAssignment?.localId,
      );
      return departure ? 'stopping' : arrival.attention ? 'attention' : 'starting';
    });
  const views = [...server.map((stint) => stint.view), ...local];
  const hasArrived =
    job.status === 'active' ||
    queued.some(
      (capture) =>
        capture.role === 'arrival' &&
        !capture.attention &&
        (capture.startAssignment?.jobId === job.id ||
          (typeof capture.assignmentId === 'string' && stintIds.has(capture.assignmentId))),
    );
  return {
    machines: job.stints.length + local.length,
    running: views.filter((view) => view === 'running' || view === 'starting').length,
    hasArrived,
  };
}
