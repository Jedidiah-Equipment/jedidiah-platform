import { SupplierInvoiceExtraction } from '@pkg/schema';
import type { LanguageModel } from 'ai';
import { generateObject } from 'ai';
import { z } from 'zod';

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
Write invoiceDate as YYYY-MM-DD, or null if the invoice prints no date.
Amounts are ZAR. Exclude VAT summary rows, subtotals, and totals — those are not billed lines.`;

/**
 * The shape asked of the model, which is deliberately not the shape we persist.
 *
 * Structured outputs run in strict mode, where every property must be listed in the schema's
 * `required` array and `default` is not a keyword the provider accepts. The AI SDK generates its
 * JSON Schema with `io: 'input'`, under which a `.default()` field is an optional one — so handing
 * the persisted schema straight to the model produces a request with no `required` array at all,
 * which the provider rejects outright. Every invoice, every time, whatever the PDF said.
 *
 * Asking for the fields as required-and-nullable satisfies strict mode while asking for exactly
 * what the prompt already demands: the value, or null where the invoice prints none. The
 * constraints the persisted schema carries — trimmed non-empty text, a real calendar date — are
 * ours to apply on the way in, not conditions to impose on a model transcribing a messy PDF.
 */
const ModelSupplierInvoiceLine = z.object({
  description: z.string(),
  jobCodes: z.array(z.string()),
  lineTotal: z.number().nullable(),
  partCode: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
});

export const ModelSupplierInvoiceExtraction = z.object({
  invoiceDate: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  jobCodes: z.array(z.string()),
  lines: z.array(ModelSupplierInvoiceLine),
});

/** Blank is the model's way of saying nothing was printed; the contract spells that null. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

/** A number the model could not read comes back as a non-finite value on occasion; that is null too. */
function finiteOrNull(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The model's answer, narrowed to the contract.
 *
 * A date it wrote in the wrong format, a blank code, an empty Job reference — none of those are a
 * failed read, and none may sink the lines that came back clean. They are normalised away here so
 * that a partly-messy transcription still reaches the panel, which is the whole point of an
 * advisory cross-check.
 */
export function toSupplierInvoiceExtraction(
  raw: z.infer<typeof ModelSupplierInvoiceExtraction>,
): SupplierInvoiceExtraction {
  const invoiceDate = blankToNull(raw.invoiceDate);

  return SupplierInvoiceExtraction.parse({
    invoiceDate: invoiceDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) ? invoiceDate : null,
    invoiceNumber: blankToNull(raw.invoiceNumber),
    jobCodes: raw.jobCodes.map((code) => code.trim()).filter(Boolean),
    lines: raw.lines.map((line) => ({
      description: line.description.trim(),
      jobCodes: line.jobCodes.map((code) => code.trim()).filter(Boolean),
      lineTotal: finiteOrNull(line.lineTotal),
      partCode: blankToNull(line.partCode),
      quantity: finiteOrNull(line.quantity),
      unitPrice: finiteOrNull(line.unitPrice),
    })),
  });
}

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
          { data: bytes, filename: 'invoice.pdf', mediaType: contentType, type: 'file' },
        ],
        role: 'user',
      },
    ],
    model,
    schema: ModelSupplierInvoiceExtraction,
    schemaName: 'SupplierInvoiceExtraction',
    system: SUPPLIER_INVOICE_SYSTEM_PROMPT,
  });

  return toSupplierInvoiceExtraction(object);
}
