import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';
import { Assembly, ProductCurrencyCode } from '../products/product.js';

export type QuoteStatus = z.infer<typeof QuoteStatus>;
export const QuoteStatus = z.enum(['draft', 'sent', 'accepted', 'rejected']);

export { formatQuoteCode, QuoteCode } from '../common/public-code.js';

export type QuoteNotes = z.infer<typeof QuoteNotes>;
export const QuoteNotes = z.string().trim().min(1).nullable();

export type QuoteNotesInput = z.infer<typeof QuoteNotesInput>;
export const QuoteNotesInput = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null);

export type QuotePaymentTerms = z.infer<typeof QuotePaymentTerms>;
export const QuotePaymentTerms = z.string().trim().min(1).nullable();

export type QuotePaymentTermsInput = z.infer<typeof QuotePaymentTermsInput>;
export const QuotePaymentTermsInput = z
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
  salesPersonId: AuthId,
  status: QuoteStatus,
  discount: Price,
  deliveryIncluded: z.boolean(),
  deliveryPrice: Price,
  validUntil: DateIso.nullable(),
  preferredDeliveryDate: DateOnlyIso.nullable(),
  plannedDeliveryDate: DateOnlyIso.nullable(),
  notes: QuoteNotes,
  paymentTerms: QuotePaymentTerms,
  quotedBasePrice: Price,
  quotedCurrencyCode: ProductCurrencyCode,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type QuoteLinkedJob = z.infer<typeof QuoteLinkedJob>;
export const QuoteLinkedJob = z.object({
  jobCode: JobCode,
  jobId: UUID,
});

export type QuoteSelectedAssembly = z.infer<typeof QuoteSelectedAssembly>;
export const QuoteSelectedAssembly = z.object({
  id: UUID,
  quoteId: UUID,
  productAssemblyId: UUID.nullable(),
  quotedName: z.string().trim().min(1),
  quotedPrice: Price,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type QuoteSelectedAssemblyInput = z.infer<typeof QuoteSelectedAssemblyInput>;
export const QuoteSelectedAssemblyInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('existing'),
    id: UUID,
  }),
  z.object({
    type: z.literal('catalog'),
    productAssemblyId: UUID,
  }),
]);

export type QuoteSummary = z.infer<typeof QuoteSummary>;
export const QuoteSummary = Quote.extend({
  customerCompanyName: z.string().trim().min(1),
  linkedJobs: z.array(QuoteLinkedJob),
  productCurrencyCode: ProductCurrencyCode,
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  salesPersonEmail: z.email().nullable(),
  salesPersonName: z.string().trim().min(1).nullable(),
  selectedAssemblies: z.array(QuoteSelectedAssembly),
});

export type QuoteDetail = z.infer<typeof QuoteDetail>;
export const QuoteDetail = QuoteSummary.extend({
  productAssemblies: z.array(Assembly),
});

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

export type QuoteExistingCustomerInput = z.infer<typeof QuoteExistingCustomerInput>;
export const QuoteExistingCustomerInput = z.object({
  type: z.literal('existing'),
  customerId: UUID,
});

export type QuoteCreateInput = z.infer<typeof QuoteCreateInput>;
export const QuoteCreateInput = z.object({
  customer: QuoteCustomerInput,
  productId: UUID,
  salesPersonId: AuthId,
  status: QuoteStatus,
  discount: z.coerce.number().pipe(Price).default(0),
  deliveryIncluded: z.boolean().default(true),
  deliveryPrice: z.coerce.number().pipe(Price).default(0),
  validUntil: DateIso.nullable().default(null),
  preferredDeliveryDate: DateOnlyIso.nullable().default(null),
  plannedDeliveryDate: DateOnlyIso.nullable().default(null),
  notes: QuoteNotesInput,
  paymentTerms: QuotePaymentTermsInput,
  selectedAssemblies: z.array(QuoteSelectedAssemblyInput).default([]),
});

export type QuoteUpdateInput = z.infer<typeof QuoteUpdateInput>;
export const QuoteUpdateInput = QuoteCreateInput.extend({
  customer: QuoteExistingCustomerInput,
  id: UUID,
}).strict();

export type QuoteSortBy = z.infer<typeof QuoteSortBy>;
export const QuoteSortBy = z.enum([
  'code',
  'createdAt',
  'customerCompanyName',
  'productName',
  'salesPersonName',
  'status',
]);

export type QuoteListFilters = z.infer<typeof QuoteListFilters>;
export const QuoteListFilters = z
  .object({
    customerId: UUID.optional(),
    productId: UUID.optional(),
    salesPersonId: AuthId.optional(),
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
