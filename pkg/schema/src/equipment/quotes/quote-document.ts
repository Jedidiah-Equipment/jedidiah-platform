import { z } from 'zod';
import type { UUID } from '../../common/uuid.js';
import type { QuoteDocument } from '../documents/document.js';

export type QuoteDocumentPricingRow = {
  amount: number;
  descriptionLines: string[];
  kind: 'base' | 'charge' | 'discount' | 'optional';
  quantity: number;
  unitPrice: number;
};

export type QuoteDocumentWorkItem = {
  amount: number;
  charges: QuoteWorkItemCharge[];
  /** The shop's own second line under the heading — what the work actually is. */
  description: string | null;
  name: string;
};

/**
 * One charge making up a Work Item total: the Work Item's Labour, priced as hours at its own snapshotted
 * hourly rate, or one of its Parts. Shared by every surface that shows a Work Item breakdown.
 */
export type QuoteWorkItemCharge = {
  amount: number;
  kind: 'labour' | 'part';
  label: string;
  quantity: number;
  unitPrice: number;
};

export type QuoteDocumentCustomer = {
  address: string | null;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  vatNumber: string | null;
};

export type QuoteDocumentSalesPerson = {
  email: string;
  name: string;
  phoneNumber: string | null;
} | null;

export type QuoteDocumentModel = {
  currencyCode: string;
  customer: QuoteDocumentCustomer;
  issueDate: Date;
  leadTime: string;
  pricingRows: QuoteDocumentPricingRow[];
  notes: string[];
  paymentTerms: string;
  quoteCode: string;
  salesPerson: QuoteDocumentSalesPerson;
  staleSelectionNotes: string[];
  subtotal: number;
  total: number;
  transport: string;
  vatAmount: number;
  workItems: QuoteDocumentWorkItem[];
};

export type QuoteDocumentCreateInput = {
  bytes: Uint8Array;
  filename: string;
  metadata: unknown;
  quoteId: UUID;
};

export type QuoteDocumentGenerationWarning = z.infer<typeof QuoteDocumentGenerationWarning>;
export const QuoteDocumentGenerationWarning = z.object({
  code: z.literal('quote_document.brochure_config_incomplete'),
  message: z.string(),
});

export type QuoteDocumentGenerationResult = {
  document: QuoteDocument;
  warnings: QuoteDocumentGenerationWarning[];
};

export type QuoteDocumentPdfRenderer = (input: {
  document: QuoteDocumentModel;
  filename: string;
}) => Promise<Uint8Array>;
