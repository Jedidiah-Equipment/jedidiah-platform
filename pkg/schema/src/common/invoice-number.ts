import { z } from 'zod';

/** The accounting system's number, as printed there. Free text: its format is theirs; only blank and absurd length are refused. */
export const InvoiceNumber = z.string().trim().min(1, 'Enter the invoice number').max(40);
export type InvoiceNumber = z.infer<typeof InvoiceNumber>;
export const InvoiceNumberLookupInput = z.object({ invoiceNumber: InvoiceNumber }).strict();
export type InvoiceNumberLookupInput = z.infer<typeof InvoiceNumberLookupInput>;
