import { SupplierInvoiceExtraction } from '@pkg/schema';
import type { LanguageModel } from 'ai';
import { generateObject } from 'ai';

/**
 * Reads a Supplier's invoice PDF into structured lines (spec §5).
 *
 * Advisory only, and the prompt says so: nothing here decides anything, and the ledger is written
 * only by the human click that follows. The one thing the model must not do is invent — a number
 * the invoice does not print comes back null, because a guessed price would be indistinguishable
 * from a real disagreement in the panel and would be exactly the sort of thing a busy desk applies
 * without looking.
 *
 * Job codes are asked for because Suppliers echo them back on their invoices, which makes them free
 * matching hints (spec §4).
 */
const SUPPLIER_INVOICE_SYSTEM_PROMPT = `Extract the billed lines from this South African supplier invoice.
Transcribe only what the document prints. Never infer, calculate, or fill in a value that is not there — use null instead.
Return one entry per billed line in the order it appears, including delivery, handling, and surcharge lines.
Put the line's own part or stock code in partCode, whether it is our code or the supplier's; leave it null when the line prints none.
Copy any job or order reference the supplier echoes into jobCodes.
Amounts are ZAR. Exclude VAT summary rows, subtotals, and totals — those are not billed lines.`;

export async function extractSupplierInvoice({
  bytes,
  contentType,
  model,
}: {
  bytes: Uint8Array;
  contentType: string;
  model: LanguageModel;
}): Promise<SupplierInvoiceExtraction> {
  const { object } = await generateObject({
    // One attempt. A failed read is a supported outcome the panel reports plainly, so retrying a
    // provider that has already refused this document only delays saying so.
    maxRetries: 0,
    messages: [
      {
        content: [
          { text: 'Extract the billed lines from the attached invoice.', type: 'text' },
          { data: bytes, mediaType: contentType, type: 'file' },
        ],
        role: 'user',
      },
    ],
    model,
    schema: SupplierInvoiceExtraction,
    schemaName: 'SupplierInvoiceExtraction',
    system: SUPPLIER_INVOICE_SYSTEM_PROMPT,
  });

  return object;
}
