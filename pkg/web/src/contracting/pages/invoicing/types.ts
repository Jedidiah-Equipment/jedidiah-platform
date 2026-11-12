import type { JobQueue } from '@pkg/schema/contracting';

/** The stages Invoicing lists: work waiting for an invoice number, and what has been invoiced. */
export const invoicingStages = ['awaiting-invoice', 'invoiced'] as const satisfies readonly JobQueue[];

export type InvoicingStage = (typeof invoicingStages)[number];

export const isInvoicingStage = (queue: JobQueue | undefined): queue is InvoicingStage =>
  (invoicingStages as readonly (JobQueue | undefined)[]).includes(queue);
