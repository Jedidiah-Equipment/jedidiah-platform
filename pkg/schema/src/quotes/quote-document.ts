import type { UUID } from '../common/uuid.js';
import type { QuoteDocument } from '../documents/document.js';

export type QuoteDocumentLineItem = {
  amount: number;
  descriptionLines: string[];
  kind: 'base' | 'charge' | 'discount' | 'lineItem' | 'optional';
  quantity: number;
  unitPrice?: number;
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
  lineItems: QuoteDocumentLineItem[];
  notes: string[];
  paymentTerms: string;
  quoteCode: string;
  salesPerson: QuoteDocumentSalesPerson;
  staleSelectionNotes: string[];
  subtotal: number;
  total: number;
  transport: string;
  vatAmount: number;
};

export type QuoteDocumentCreateInput = {
  bytes: Uint8Array;
  filename: string;
  metadata: unknown;
  quoteId: UUID;
};

export type QuoteDocumentGenerationWarning = {
  code: 'quote_document.brochure_config_incomplete';
  message: string;
};

export type QuoteDocumentGenerationResult = {
  document: QuoteDocument;
  warnings: QuoteDocumentGenerationWarning[];
};

export type QuoteDraftEmailResult = {
  recipientEmail: string;
  warnings: QuoteDocumentGenerationWarning[];
};

export type QuoteDocumentPdfRenderer = (input: {
  document: QuoteDocumentModel;
  filename: string;
}) => Promise<Uint8Array>;
