import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { nullableTrimmedText, nullableTrimmedTextInput, requiredTrimmedText } from '../common/text.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';
import { CustomerEmail, CustomerOptionalText, CustomerVatNumber } from '../customers/customer.js';
import {
  Assembly,
  ProductBay,
  ProductCurrencyCode,
  ProductDescription,
  ProductRequiresVinNumber,
} from '../products/product.js';

export type QuoteStatus = z.infer<typeof QuoteStatus>;
export const QuoteStatus = z.enum(['draft', 'sent', 'accepted', 'rejected', 'cancelled']);

export { formatQuoteCode, QuoteCode } from '../common/public-code.js';

export type QuoteNotes = z.infer<typeof QuoteNotes>;
export const QuoteNotes = nullableTrimmedText();

export type QuoteNotesInput = z.infer<typeof QuoteNotesInput>;
export const QuoteNotesInput = nullableTrimmedTextInput();

export type QuoteDocumentNotes = z.infer<typeof QuoteDocumentNotes>;
export const QuoteDocumentNotes = nullableTrimmedText();

export type QuoteDocumentNotesInput = z.infer<typeof QuoteDocumentNotesInput>;
export const QuoteDocumentNotesInput = nullableTrimmedTextInput();

export type QuoteDocumentLeadTime = z.infer<typeof QuoteDocumentLeadTime>;
export const QuoteDocumentLeadTime = requiredTrimmedText('Lead time is required');

export type QuoteDepositPercent = z.infer<typeof QuoteDepositPercent>;
export const QuoteDepositPercent = z.number().min(0, 'Must be zero or greater').max(100, 'Must be 100 or less');

export type QuoteDiscountPercent = z.infer<typeof QuoteDiscountPercent>;
export const QuoteDiscountPercent = z.number().min(0, 'Must be zero or greater').max(100, 'Must be 100 or less');

export type Quote = z.infer<typeof Quote>;
export const Quote = z.object({
  id: UUID,
  code: QuoteCode,
  customerId: UUID,
  productId: UUID,
  salesPersonId: AuthId,
  status: QuoteStatus,
  discountPercent: QuoteDiscountPercent,
  depositPercent: QuoteDepositPercent,
  deliveryIncluded: z.boolean(),
  deliveryPrice: Price,
  validUntil: DateIso.nullable(),
  preferredDeliveryDate: DateOnlyIso.nullable(),
  plannedDeliveryDate: DateOnlyIso.nullable(),
  notes: QuoteNotes,
  documentNotes: QuoteDocumentNotes,
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
  customerThumbnailDataUrl: NullableThumbnailDataUrl,
  linkedJobs: z.array(QuoteLinkedJob),
  productCurrencyCode: ProductCurrencyCode,
  productModelCode: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  productBuildTimeDays: z.number().int().min(0),
  salesPersonEmail: z.email().nullable(),
  salesPersonName: z.string().trim().min(1).nullable(),
  salesPersonThumbnailDataUrl: NullableThumbnailDataUrl,
  selectedAssemblies: z.array(QuoteSelectedAssembly),
});

export type PriorityQuote = z.infer<typeof PriorityQuote>;
export const PriorityQuote = QuoteSummary.extend({
  earliestDeliveryDate: DateOnlyIso,
});

export type QuoteDetail = z.infer<typeof QuoteDetail>;
export const QuoteDetail = QuoteSummary.extend({
  customerAddress: CustomerOptionalText,
  customerContactPerson: CustomerOptionalText,
  customerEmail: CustomerEmail.nullable(),
  customerPhone: CustomerOptionalText,
  customerVatNumber: CustomerVatNumber,
  productAssemblies: z.array(Assembly),
  productBays: z.array(ProductBay),
  productDescription: ProductDescription,
  productRequiresVinNumber: ProductRequiresVinNumber,
  productThumbnailDataUrl: NullableThumbnailDataUrl,
});

export type QuoteCustomerInput = z.infer<typeof QuoteCustomerInput>;
export const QuoteCustomerInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('existing'),
    customerId: UUID,
  }),
  z.object({
    type: z.literal('inline'),
    companyName: requiredTrimmedText('Company name is required'),
  }),
]);

export type QuoteCreateInput = z.infer<typeof QuoteCreateInput>;
export const QuoteCreateInput = z.object({
  customer: QuoteCustomerInput,
  productId: UUID,
  salesPersonId: AuthId,
  status: QuoteStatus,
  discountPercent: z.coerce.number().pipe(QuoteDiscountPercent).default(0),
  depositPercent: z.coerce.number().pipe(QuoteDepositPercent).default(0),
  deliveryIncluded: z.boolean().default(true),
  deliveryPrice: z.coerce.number().pipe(Price).default(0),
  validUntil: DateIso.nullable().default(null),
  preferredDeliveryDate: DateOnlyIso.nullable().default(null),
  plannedDeliveryDate: DateOnlyIso.nullable().default(null),
  notes: QuoteNotesInput,
  documentNotes: QuoteDocumentNotesInput,
  selectedAssemblies: z.array(QuoteSelectedAssemblyInput).default([]),
});

export type QuoteUpdateInput = z.infer<typeof QuoteUpdateInput>;
export const QuoteUpdateInput = z
  .object({
    id: UUID,
    salesPersonId: AuthId,
    status: QuoteStatus,
    discountPercent: z.coerce.number().pipe(QuoteDiscountPercent).default(0),
    depositPercent: z.coerce.number().pipe(QuoteDepositPercent).default(0),
    deliveryIncluded: z.boolean().default(true),
    deliveryPrice: z.coerce.number().pipe(Price).default(0),
    validUntil: DateIso.nullable().default(null),
    preferredDeliveryDate: DateOnlyIso.nullable().default(null),
    plannedDeliveryDate: DateOnlyIso.nullable().default(null),
    notes: QuoteNotesInput,
    documentNotes: QuoteDocumentNotesInput,
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput).default([]),
  })
  .strict();

export type QuoteDocumentGenerationInput = z.infer<typeof QuoteDocumentGenerationInput>;
export const QuoteDocumentGenerationInput = z.object({
  quoteId: UUID,
  leadTime: QuoteDocumentLeadTime,
});

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
export const QuoteListInput = createSearchedSortedPagedQueryInput({
  defaultSortDirection: 'desc',
  shape: {
    filters: QuoteListFilters,
  },
  sortBy: QuoteSortBy.default('createdAt'),
});

export type QuoteListResult = z.infer<typeof QuoteListResult>;
export const QuoteListResult = createSortedPagedQueryResult(QuoteSummary, QuoteSortBy);

export type QuoteStatusCount = z.infer<typeof QuoteStatusCount>;
export const QuoteStatusCount = z.object({
  status: QuoteStatus,
  count: z.number().int().min(0),
});

export type QuoteStatusSummary = z.infer<typeof QuoteStatusSummary>;
export const QuoteStatusSummary = z.object({
  items: z.array(QuoteStatusCount),
});

export type QuoteCreatedByWeekCount = z.infer<typeof QuoteCreatedByWeekCount>;
export const QuoteCreatedByWeekCount = z.object({
  weekStartDate: DateOnlyIso,
  count: z.number().int().min(0),
});

export type QuoteCreatedByWeekSummary = z.infer<typeof QuoteCreatedByWeekSummary>;
export const QuoteCreatedByWeekSummary = z.object({
  items: z.array(QuoteCreatedByWeekCount),
});
