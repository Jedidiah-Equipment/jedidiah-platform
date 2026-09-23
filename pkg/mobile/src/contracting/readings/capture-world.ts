import { type CaptureWorld, judgeCapture } from '@pkg/domain/contracting';
import type {
  AssignmentState,
  FieldImplement,
  FieldJob,
  FieldMachine,
  FieldReading,
  FieldStint,
} from '@pkg/schema/contracting';
import { deriveStint, type StintView } from '@/contracting/jobs/derive-stint';
import type { QueuedReading } from './reading-queue';

type OnSite = CaptureWorld['onSite'][number];

/** What the phone believes a stint is once its queue syncs. */
function believedState(view: StintView): AssignmentState {
  switch (view.view) {
    case 'planned':
      return 'planned';
    case 'starting':
    case 'running':
      return 'on-site';
    case 'stopping':
    case 'left':
      return 'left';
    case 'attention':
      return view.state;
  }
}

/** The Machine's latest known reading: the newest of the queue and the served history. */
export function latestKnownReading(
  machineId: string,
  queued: readonly QueuedReading[],
  history: readonly Pick<FieldReading, 'id' | 'value' | 'capturedAt'>[] | undefined,
): CaptureWorld['latest'] {
  const local = queued
    .filter((row) => row.machineId === machineId)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0];
  const server = history?.[0];
  if (local && (!server || Date.parse(local.capturedAt) >= Date.parse(server.capturedAt)))
    return { id: local.localId, value: local.value };
  return server ? { id: server.id, value: server.value } : null;
}

/**
 * The world a capture is judged in on the phone: served Jobs and fleet with the queue applied on top.
 * A queued departure frees its Machine and Implement at once, which is what lets a machine that has
 * just left be re-added elsewhere before the departure syncs; what the server says is on site fills
 * in only where nothing on the phone knows better.
 */
export function captureWorld({
  machineId,
  stintId,
  queued,
  history,
  jobs,
  fleet,
  implementRows,
  management,
  hasPhoto,
}: {
  machineId: string;
  /** The stint the capture lands on; null for a spot reading or a stint the capture starts. */
  stintId: string | null;
  queued: readonly QueuedReading[];
  history: readonly Pick<FieldReading, 'id' | 'value' | 'capturedAt'>[] | undefined;
  jobs: readonly FieldJob[];
  fleet: readonly FieldMachine[];
  implementRows: readonly FieldImplement[];
  management: boolean;
  hasPhoto: boolean;
}): CaptureWorld {
  const departed = new Set(queued.flatMap((c) => (c.role === 'departure' && c.assignmentId ? [c.assignmentId] : [])));
  const served = jobs.flatMap((job) => job.stints.map((row: FieldStint) => ({ job, view: deriveStint(row, queued) })));
  const starts = queued.flatMap((c) =>
    c.role === 'arrival' && c.startAssignment && !c.attention
      ? [{ capture: c, start: c.startAssignment, left: departed.has(c.startAssignment.localId) }]
      : [],
  );

  const local: OnSite[] = [
    ...served
      .filter(({ view }) => believedState(view) === 'on-site')
      .map(({ job, view }) => ({ machineId: view.machineId, implementId: view.implementId, jobNumber: job.jobNumber })),
    ...starts
      .filter(({ start, left }) => !left && !served.some(({ view }) => view.id === start.localId))
      .map(({ capture, start }) => ({
        machineId: capture.machineId,
        implementId: start.implementId,
        jobNumber: jobs.find((job) => job.id === start.jobId)?.jobNumber ?? null,
      })),
  ];
  const freedMachines = new Set([
    ...served.filter(({ view }) => departed.has(view.id)).map(({ view }) => view.machineId),
    ...starts.filter(({ left }) => left).map(({ capture }) => capture.machineId),
  ]);
  const freedImplements = new Set([
    ...served.flatMap(({ view }) => (departed.has(view.id) && view.implementId ? [view.implementId] : [])),
    ...starts.flatMap(({ start, left }) => (left && start.implementId ? [start.implementId] : [])),
  ]);
  const knownMachine = (id: string) => freedMachines.has(id) || local.some((row) => row.machineId === id);
  const knownImplement = (id: string) => freedImplements.has(id) || local.some((row) => row.implementId === id);

  const onSite: OnSite[] = [
    ...local,
    ...fleet
      .filter((row) => row.onSiteJobNumber && !knownMachine(row.id))
      .map((row) => ({ machineId: row.id, implementId: null, jobNumber: row.onSiteJobNumber })),
    ...implementRows
      .filter((row) => row.onSiteJobNumber && !knownImplement(row.id))
      .map((row) => ({ machineId: null, implementId: row.id, jobNumber: row.onSiteJobNumber })),
  ];

  const servedStint = stintId ? served.find(({ view }) => view.id === stintId) : undefined;
  const startedStint = stintId ? starts.find(({ start }) => start.localId === stintId) : undefined;
  const stint: AssignmentState | null = servedStint
    ? believedState(servedStint.view)
    : startedStint
      ? startedStint.left
        ? 'left'
        : 'on-site'
      : null;

  return { latest: latestKnownReading(machineId, queued, history), stint, onSite, management, hasPhoto };
}

/**
 * The Job a Machine or Implement is on elsewhere, as the capture rules judge an arrival bringing it:
 * what the Add Machine picker greys out and labels.
 */
export function onSiteElsewhere(
  world: CaptureWorld,
  { machineId = null, implementId = null }: { machineId?: string | null; implementId?: string | null },
): string | null {
  const verdict = judgeCapture(
    { ...world, latest: null, stint: null },
    {
      role: 'arrival',
      value: 0,
      machineId: machineId ?? '',
      implementId,
      disputePrevious: false,
      expectedPreviousId: undefined,
      comment: null,
    },
  );
  if (verdict.ok || (verdict.rule !== 'machine-busy' && verdict.rule !== 'implement-busy')) return null;
  return verdict.jobNumber ?? 'another Job';
}
