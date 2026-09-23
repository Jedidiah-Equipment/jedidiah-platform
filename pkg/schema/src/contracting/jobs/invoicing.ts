import { z } from 'zod';
import { UUID } from '../../common/uuid.js';
import { Money } from './job.js';

/** The accounting system's number, as printed there. Free text: its format is theirs; only blank and absurd length are refused. */
export const InvoiceNumber = z.string().trim().min(1, 'Enter the invoice number').max(40);
export const JobStampInvoiceInput = z
  .object({
    id: UUID,
    invoiceNumber: InvoiceNumber,
    /** The frozen total on screen; a mismatch means the Job was reopened and re-priced under the user. */
    expectedTotal: Money,
  })
  .strict();
export type JobStampInvoiceInput = z.infer<typeof JobStampInvoiceInput>;
export const InvoiceNumberLookupInput = z.object({ invoiceNumber: InvoiceNumber }).strict();
export type InvoiceNumberLookupInput = z.infer<typeof InvoiceNumberLookupInput>;
