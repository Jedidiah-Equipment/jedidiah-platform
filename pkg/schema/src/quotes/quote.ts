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
import { Bay } from '../jobs/job.js';
import {
  Assembly,
  ProductBay,
  ProductBayDefaultWorkingDays,
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
  productId: UUID.nullable(),
  salesPersonId: AuthId,
  status: QuoteStatus,
  statusChangedAt: DateIso,
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

export type QuoteLineItemName = z.infer<typeof QuoteLineItemName>;
export const QuoteLineItemName = requiredTrimmedText('Line item name is required');

export type QuoteLineItemQuantity = z.infer<typeof QuoteLineItemQuantity>;
export const QuoteLineItemQuantity = z.number().int().min(1, 'Must be 1 or greater');

export type QuoteLineItem = z.infer<typeof QuoteLineItem>;
export const QuoteLineItem = z.object({
  id: UUID,
  quoteId: UUID,
  name: QuoteLineItemName,
  quantity: QuoteLineItemQuantity,
  unitPrice: Price,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type QuoteLineItemInput = z.infer<typeof QuoteLineItemInput>;
export const QuoteLineItemInput = z.object({
  name: QuoteLineItemName,
  quantity: z.coerce.number().pipe(QuoteLineItemQuantity).default(1),
  unitPrice: z.coerce.number().pipe(Price),
});

export type QuoteSummary = z.infer<typeof QuoteSummary>;
export const QuoteSummary = Quote.extend({
  customerCompanyName: z.string().trim().min(1),
  customerThumbnailDataUrl: NullableThumbnailDataUrl,
  job: QuoteLinkedJob.nullable(),
  productCurrencyCode: ProductCurrencyCode.nullable(),
  productModelCode: z.string().trim().min(1).nullable(),
  productName: z.string().trim().min(1).nullable(),
  productBuildTimeDays: z.number().int().min(0).nullable(),
  salesPersonEmail: z.email().nullable(),
  salesPersonName: z.string().trim().min(1).nullable(),
  salesPersonThumbnailDataUrl: NullableThumbnailDataUrl,
  lineItems: z.array(QuoteLineItem),
  selectedAssemblies: z.array(QuoteSelectedAssembly),
});

export type PriorityQuote = z.infer<typeof PriorityQuote>;
export const PriorityQuote = QuoteSummary.extend({
  earliestDeliveryDate: DateOnlyIso,
});

export type UpcomingDeliveryQuote = z.infer<typeof UpcomingDeliveryQuote>;
export const UpcomingDeliveryQuote = QuoteSummary.extend({
  plannedDeliveryDate: DateOnlyIso,
});

export type UpcomingDeliveryQuotesResult = z.infer<typeof UpcomingDeliveryQuotesResult>;
export const UpcomingDeliveryQuotesResult = z.object({
  items: z.array(UpcomingDeliveryQuote),
  today: DateOnlyIso,
  windowEndDate: DateOnlyIso,
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
  productDescription: ProductDescription.nullable(),
  productRequiresVinNumber: ProductRequiresVinNumber.nullable(),
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
  lineItems: z.array(QuoteLineItemInput).default([]),
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
    lineItems: z.array(QuoteLineItemInput).default([]),
    selectedAssemblies: z.array(QuoteSelectedAssemblyInput).default([]),
  })
  .strict();

export type QuoteDocumentGenerationInput = z.infer<typeof QuoteDocumentGenerationInput>;
export const QuoteDocumentGenerationInput = z.object({
  quoteId: UUID,
  leadTime: QuoteDocumentLeadTime,
});

export type QuoteDraftEmailInput = z.infer<typeof QuoteDraftEmailInput>;
export const QuoteDraftEmailInput = QuoteDocumentGenerationInput;

export type QuoteProductBayAvailabilityInput = z.infer<typeof QuoteProductBayAvailabilityInput>;
export const QuoteProductBayAvailabilityInput = z
  .object({
    quoteId: UUID,
  })
  .strict();

export type QuoteProductBayAvailabilityBay = z.infer<typeof QuoteProductBayAvailabilityBay>;
export const QuoteProductBayAvailabilityBay = Bay.pick({
  department: true,
  name: true,
}).extend({
  bayId: UUID,
  defaultWorkingDays: ProductBayDefaultWorkingDays,
  nextAvailableDate: DateOnlyIso,
  waitWorkingDays: z.number().int().min(0),
});

export type QuoteProductBayAvailabilityResult = z.infer<typeof QuoteProductBayAvailabilityResult>;
export const QuoteProductBayAvailabilityResult = z
  .object({
    bays: z.array(QuoteProductBayAvailabilityBay),
    buildTimeDays: z.number().int().min(0),
    defaultLeadTimeWorkingDays: z.number().int().min(0),
    maxBayWaitWorkingDays: z.number().int().min(0),
  })
  .strict();

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

export type QuotePipelineSummary = z.infer<typeof QuotePipelineSummary>;
export const QuotePipelineSummary = z.object({
  accepted90dCount: z.number().int().min(0),
  newlySent30dValue: Price,
  openSentCount: z.number().int().min(0),
  openSentValue: Price,
  rejected90dCount: z.number().int().min(0),
});

export type QuoteWeeklyFlowPoint = z.infer<typeof QuoteWeeklyFlowPoint>;
export const QuoteWeeklyFlowPoint = z.object({
  weekStartDate: DateOnlyIso,
  acceptedCount: z.number().int().min(0),
  createdCount: z.number().int().min(0),
});

export type QuoteWeeklyFlowSummary = z.infer<typeof QuoteWeeklyFlowSummary>;
export const QuoteWeeklyFlowSummary = z.object({
  items: z.array(QuoteWeeklyFlowPoint),
});

export type StaleSentQuote = z.infer<typeof StaleSentQuote>;
export const StaleSentQuote = z.object({
  id: UUID,
  code: QuoteCode,
  customerCompanyName: z.string().trim().min(1),
  customerThumbnailDataUrl: NullableThumbnailDataUrl,
  currencyCode: ProductCurrencyCode,
  sentDaysAgo: z.number().int().min(0),
  statusChangedAt: DateIso,
  totalValue: Price,
});

export type StaleSentQuoteList = z.infer<typeof StaleSentQuoteList>;
export const StaleSentQuoteList = z.object({
  items: z.array(StaleSentQuote),
});
