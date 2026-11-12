import type { AuthId } from '@pkg/schema';
import { type JobStatus, unpricedJobStatuses } from '@pkg/schema/contracting';
import { transitionEdges } from '../lifecycle/transition-edges.js';
import { jobStatusLabels } from './jobs.js';

/** One move along the Job lifecycle; the caller has already asserted the Job Action. */
const edge = transitionEdges<JobStatus, { status: JobStatus }>('Job', jobStatusLabels);

export const jobTransitions = {
  activate: edge(
    'activate',
    ['upcoming'],
    (event: { at: Date; byUserId: AuthId }) =>
      ({ status: 'active', activatedAt: event.at, activatedByUserId: event.byUserId }) as const,
  ),
  /** The Job's only arrival was removed: back to Upcoming, as if it never started. */
  deactivate: edge(
    'deactivate',
    ['active'],
    () => ({ status: 'upcoming', activatedAt: null, activatedByUserId: null }) as const,
  ),
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
