import { z } from 'zod';

/** The accounting system's number, as printed there. Free text: its format is theirs; only blank and absurd length are refused. */
export const InvoiceNumber = z.string().trim().min(1, 'Enter the invoice number').max(40);
export type InvoiceNumber = z.infer<typeof InvoiceNumber>;
export const InvoiceNumberLookupInput = z.object({ invoiceNumber: InvoiceNumber }).strict();
export type InvoiceNumberLookupInput = z.infer<typeof InvoiceNumberLookupInput>;

/** Invoiced by month on each business's Dashboard: this plant-time month to date and the three full months before it. */
export const INVOICED_MONTHS_SHOWN = 4;
