import type { ContractingPushEvent } from '@pkg/domain/contracting';
import type { Scheduler } from '../../background-queue.js';

/** What a Contracting route holds of the push queue: it schedules an event once a write has committed, never waits. */
export type ContractingPushScheduler = Scheduler<ContractingPushEvent>;
