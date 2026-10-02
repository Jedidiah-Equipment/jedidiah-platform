import type { AuthId } from '@pkg/schema';
import { type JobStatus, unpricedJobStatuses } from '@pkg/schema/contracting';
import { jobStatusLabels } from './jobs.js';

/**
 * One move along the Job lifecycle: the statuses it leaves and the columns that travel with it, including
 * the ones the database requires cleared. It judges no one: the caller has already asserted the Job Action.
 * A move the lifecycle has no edge for is a programming error, not a refusal.
 */
const edge =
  <Event, Columns extends { readonly status: JobStatus }>(
    verb: string,
    from: readonly JobStatus[],
    columns: (event: Event) => Columns,
  ) =>
  (job: { status: JobStatus }, event: Event): Columns => {
    if (!from.includes(job.status)) throw new Error(`Cannot ${verb} a Job that is ${jobStatusLabels[job.status]}.`);
    return columns(event);
  };

export const jobTransitions = {
  // biome-ignore lint/suspicious/noConfusingVoidType: a void event lets `activate` take no second argument
  activate: edge('activate', ['upcoming'], (_event: void) => ({ status: 'active' }) as const),
  complete: edge(
    'complete',
    ['active'],
    (event: { at: Date; byUserId: AuthId; startDate: string; endDate: string }) =>
      ({
        status: 'completed',
        completedAt: event.at,
        completedByUserId: event.byUserId,
        startDate: event.startDate,
        endDate: event.endDate,
      }) as const,
  ),
  price: edge(
    'price',
    ['completed'],
    (event: { at: Date; byUserId: AuthId; subtotal: number; total: number }) =>
      ({
        status: 'priced',
        pricedAt: event.at,
        pricedByUserId: event.byUserId,
        pricedSubtotal: event.subtotal,
        pricedTotal: event.total,
        reopenedAt: null,
        repricingNote: null,
      }) as const,
  ),
  reopen: edge(
    'reopen',
    ['priced'],
    (event: { at: Date; note: string }) =>
      ({
        status: 'completed',
        pricedAt: null,
        pricedByUserId: null,
        pricedSubtotal: null,
        pricedTotal: null,
        dieselAmount: null,
        discountAmount: null,
        reopenedAt: event.at,
        repricingNote: event.note,
      }) as const,
  ),
  invoice: edge(
    'invoice',
    ['priced'],
    (event: { at: Date; byUserId: AuthId; invoiceNumber: string }) =>
      ({
        status: 'invoiced',
        invoiceNumber: event.invoiceNumber,
        invoicedAt: event.at,
        invoicedByUserId: event.byUserId,
      }) as const,
  ),
  cancel: edge(
    'cancel',
    unpricedJobStatuses,
    (event: { at: Date; byUserId: AuthId; reason: string }) =>
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
  ),
};
