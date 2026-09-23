import type { AuthId } from '@pkg/schema';
import type { JobStatus } from '@pkg/schema/contracting';
import { jobStatusLabels } from './jobs.js';

/** A move along the Job lifecycle, carrying what the stamps it writes need. */
export type JobTransition =
  | { type: 'activate' }
  | { type: 'complete'; at: Date; byUserId: AuthId; startDate: string; endDate: string }
  | { type: 'price'; at: Date; byUserId: AuthId; subtotal: number; total: number }
  | { type: 'reopen'; at: Date; note: string }
  | { type: 'invoice'; at: Date; byUserId: AuthId; invoiceNumber: string }
  | { type: 'cancel'; at: Date; byUserId: AuthId; reason: string };

const transitionsFrom: Record<JobTransition['type'], readonly JobStatus[]> = {
  activate: ['upcoming'],
  complete: ['active'],
  price: ['completed'],
  reopen: ['priced'],
  invoice: ['priced'],
  cancel: ['upcoming', 'active', 'completed'],
};

/**
 * The status a lifecycle move lands on and the columns that travel with it, including the ones the
 * database requires cleared. It judges no one: the caller has already asserted the Job Action. A move
 * the lifecycle has no edge for is a programming error, not a refusal.
 */
export function transitionJob<T extends JobTransition>(
  job: { status: JobStatus },
  event: T,
): TransitionColumns<T['type']> {
  if (!transitionsFrom[event.type].includes(job.status)) {
    throw new Error(`Cannot ${event.type} a Job that is ${jobStatusLabels[job.status]}.`);
  }
  return (columnsFor[event.type] as unknown as (event: T) => TransitionColumns<T['type']>)(event);
}

type EventOf<K extends JobTransition['type']> = Extract<JobTransition, { type: K }>;

const columnsFor = {
  activate: () => ({ status: 'active' }) as const,
  complete: (event: EventOf<'complete'>) =>
    ({
      status: 'completed',
      completedAt: event.at,
      completedByUserId: event.byUserId,
      startDate: event.startDate,
      endDate: event.endDate,
    }) as const,
  price: (event: EventOf<'price'>) =>
    ({
      status: 'priced',
      pricedAt: event.at,
      pricedByUserId: event.byUserId,
      pricedSubtotal: event.subtotal,
      pricedTotal: event.total,
      reopenedAt: null,
      repricingNote: null,
    }) as const,
  reopen: (event: EventOf<'reopen'>) =>
    ({
      status: 'completed',
      pricedAt: null,
      pricedByUserId: null,
      pricedSubtotal: null,
      pricedTotal: null,
      reopenedAt: event.at,
      repricingNote: event.note,
    }) as const,
  invoice: (event: EventOf<'invoice'>) =>
    ({
      status: 'invoiced',
      invoiceNumber: event.invoiceNumber,
      invoicedAt: event.at,
      invoicedByUserId: event.byUserId,
    }) as const,
  cancel: (event: EventOf<'cancel'>) =>
    ({
      status: 'cancelled',
      cancelledAt: event.at,
      cancelledByUserId: event.byUserId,
      cancellationReason: event.reason,
      completedAt: null,
      completedByUserId: null,
      reopenedAt: null,
      repricingNote: null,
    }) as const,
} satisfies { [K in JobTransition['type']]: (event: EventOf<K>) => object };

/** The exact columns one kind of lifecycle move writes. */
export type TransitionColumns<K extends JobTransition['type']> = ReturnType<(typeof columnsFor)[K]>;
