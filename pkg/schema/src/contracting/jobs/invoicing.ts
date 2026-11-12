import { z } from 'zod';
import { InvoiceNumber } from '../../common/invoice-number.js';
import { UUID } from '../../common/uuid.js';
import { Money } from './job.js';

export const JobStampInvoiceInput = z
  .object({
    id: UUID,
    invoiceNumber: InvoiceNumber,
    expectedTotal: Money,
  })
  .strict();
export type JobStampInvoiceInput = z.infer<typeof JobStampInvoiceInput>;
