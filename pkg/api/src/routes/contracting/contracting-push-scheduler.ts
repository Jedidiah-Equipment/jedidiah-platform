import type { ContractingPushEvent } from '@pkg/domain/contracting';
import type { Scheduler } from '../../background-queue.js';

/** What a Contracting route holds of the push queue: it schedules an event once a write has committed, never waits. */
export type ContractingPushScheduler = Scheduler<ContractingPushEvent>;

/** Answers at once; the workshop alert a write crossed into Service Due Soon follows in the background. */
export function scheduleServiceDueSoon(
  push: ContractingPushScheduler,
  { machineId, serviceDueSoonCrossed }: { machineId: string; serviceDueSoonCrossed: boolean },
) {
  if (serviceDueSoonCrossed) push.schedule({ kind: 'machine.service-due-soon', machineId });
}
