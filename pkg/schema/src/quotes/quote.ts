import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';
import { ProductCurrencyCode } from '../products/product.js';

export type QuoteStatus = z.infer<typeof QuoteStatus>;
export const QuoteStatus = z.enum(['draft', 'sent', 'accepted', 'rejected']);

export function formatQuoteCode(code: number): string {
  return `QUO-${code.toString().padStart(5, '0')}`;
}

const QuoteCodeString = z
  .string()
  .regex(/^QUO-\d{5,}$/)
  .brand<'QuoteCode'>();

export type QuoteCode = z.infer<typeof QuoteCode>;
export const QuoteCode = z
  .union([z.int().positive().refine(Number.isSafeInteger), QuoteCodeString])
  .transform((code) => (typeof code === 'number' ? formatQuoteCode(code) : code))
  .pipe(QuoteCodeString);

export type QuoteNotes = z.infer<typeof QuoteNotes>;
export const QuoteNotes = z.string().trim().min(1).nullable();

export type QuoteNotesInput = z.infer<typeof QuoteNotesInput>;
export const QuoteNotesInput = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null);

export type Quote = z.infer<typeof Quote>;
export const Quote = z.object({
  id: UUID,
  code: QuoteCode,
  customerId: UUID,
  productId: UUID,
  salesPersonId: AuthId.nullable(),
  status: QuoteStatus.default('draft'),
  discount: Price,
  validUntil: z.iso.date().nullable(),
  notes: QuoteNotes,
  quotedBasePrice: Price.nullable(),
  quotedCurrencyCode: ProductCurrencyCode.nullable(),
  sentAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type QuoteSummary = z.infer<typeof QuoteSummary>;
export const QuoteSummary = Quote.extend({
  customerCompanyName: z.string().trim().min(1),
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  salesPersonEmail: z.email().nullable(),
  salesPersonName: z.string().trim().min(1).nullable(),
  total: Price,
  jobId: UUID.nullable(),
});

export type QuoteDetail = z.infer<typeof QuoteDetail>;
export const QuoteDetail = QuoteSummary;

export type QuoteCustomerInput = z.infer<typeof QuoteCustomerInput>;
export const QuoteCustomerInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('existing'),
    customerId: UUID,
  }),
  z.object({
    type: z.literal('inline'),
    companyName: z.string().trim().min(1, 'Company name is required'),
  }),
]);

export type QuoteCreateInput = z.infer<typeof QuoteCreateInput>;
export const QuoteCreateInput = z.object({
  customer: QuoteCustomerInput,
  productId: UUID,
  salesPersonId: AuthId,
  discount: z.coerce.number().pipe(Price),
  validUntil: z.iso.date().nullable().default(null),
  notes: QuoteNotesInput,
});

export type QuoteUpdateInput = z.infer<typeof QuoteUpdateInput>;
export const QuoteUpdateInput = QuoteCreateInput.extend({
  id: UUID,
});

export type QuoteSendInput = z.infer<typeof QuoteSendInput>;
export const QuoteSendInput = z.object({
  id: UUID,
});

export type QuoteDecisionInput = z.infer<typeof QuoteDecisionInput>;
export const QuoteDecisionInput = z.object({
  id: UUID,
});

export type QuoteSortBy = z.infer<typeof QuoteSortBy>;
export const QuoteSortBy = z.enum(['code', 'createdAt', 'customerCompanyName', 'productName', 'status', 'total']);

export type QuoteListFilters = z.infer<typeof QuoteListFilters>;
export const QuoteListFilters = z
  .object({
    statuses: z.array(QuoteStatus),
  })
  .default({
    statuses: [],
  });

export type QuoteListInput = z.infer<typeof QuoteListInput>;
export const QuoteListInput = PagedQueryInput.extend({
  filters: QuoteListFilters,
  search: z.string().trim().default(''),
  sortBy: QuoteSortBy.default('createdAt'),
  sortDirection: SortDirection.default('desc'),
});

export type QuoteListResult = z.infer<typeof QuoteListResult>;
export const QuoteListResult = createPagedQueryResult(QuoteSummary).extend({
  sortBy: QuoteSortBy,
  sortDirection: SortDirection,
});
