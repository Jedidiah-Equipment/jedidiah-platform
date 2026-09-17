import { type FieldImplement, type FieldJob, type FieldMachine, FieldStint } from '@pkg/schema/contracting';
import type { QueuedReading } from '@/contracting/readings/reading-queue';

export type StintView = FieldStint & {
  view: 'planned' | 'starting' | 'running' | 'stopping' | 'left' | 'attention';
  queued: QueuedReading | undefined;
};

function capturesFor(stintId: string, queued: readonly QueuedReading[]) {
  return queued.filter((capture) => capture.assignmentId === stintId || capture.startAssignment?.localId === stintId);
}

export function deriveStint(stint: FieldStint, queued: readonly QueuedReading[]): StintView {
  const mine = capturesFor(stint.id, queued);
  const attention = mine.find((capture) => capture.attention);
  if (attention) return { ...stint, view: 'attention', queued: attention };
  const arrival = mine.find((capture) => capture.role === 'arrival');
  const departure = mine.find((capture) => capture.role === 'departure');
  if (stint.state === 'left') return { ...stint, view: 'left', queued: undefined };
  if (stint.state === 'on-site')
    return departure
      ? { ...stint, view: 'stopping', queued: departure }
      : { ...stint, view: 'running', queued: undefined };
  if (!arrival) return { ...stint, view: 'planned', queued: undefined };
  return departure
    ? { ...stint, view: 'stopping', queued: departure }
    : { ...stint, view: 'starting', queued: arrival };
}

export function queuedUnplannedStints(
  jobId: string,
  queued: readonly QueuedReading[],
  fleet: readonly FieldMachine[],
  implementRows: readonly FieldImplement[],
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
              : null,
          state: 'planned',
          arrival: null,
          departure: null,
          createdAt: capture.capturedAt,
        }),
        queued,
      ),
    ];
  });
}

export function jobSummary(job: FieldJob, queued: readonly QueuedReading[]) {
  const server = job.stints.map((stint) => deriveStint(stint, queued));
  const localIds = new Set(job.stints.map((stint) => stint.id));
  const local = queued
    .filter(
      (capture) =>
        capture.role === 'arrival' &&
        capture.startAssignment?.jobId === job.id &&
        !localIds.has(capture.startAssignment.localId),
    )
    .map((arrival) => {
      const departure = queued.find(
        (capture) => capture.role === 'departure' && capture.assignmentId === arrival.startAssignment?.localId,
      );
      return departure ? 'stopping' : arrival.attention ? 'attention' : 'starting';
    });
  const views = [...server.map((stint) => stint.view), ...local];
  return {
    machines: job.stints.length + local.length,
    running: views.filter((view) => view === 'running' || view === 'starting').length,
  };
}
