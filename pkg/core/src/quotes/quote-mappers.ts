import type { customers, jobs, products, quotes, user } from '@pkg/db';
import {
  type Assembly,
  DateOnlyIso,
  JobCode,
  type PriorityQuote,
  type ProductBay,
  ProductCurrencyCode,
  Quote,
  type QuoteDetail,
  type QuoteSummary,
  UpcomingDeliveryQuote,
} from '@pkg/schema';

import { mapQuoteLineItem, type QuoteLineItemRow } from './quote-line-items.js';
import { narrowQuoteOffering } from './quote-offering.js';
import { mapQuoteSelectedAssembly, type QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

export type QuoteRow = typeof quotes.$inferSelect;

export type QuoteListRow = {
  quote: QuoteRow;
  customerCompanyName: string;
  customerThumbnailDataUrl: string | null;
  productBuildTimeDays: number | null;
  productCurrencyCode: string | null;
  productModelCode: string | null;
  productName: string | null;
  salesPersonEmail: string | null;
  salesPersonName: string | null;
  salesPersonThumbnailDataUrl: string | null;
};

export type QuoteLinkedJobRow = {
  jobCode: number;
  jobId: string;
  quoteId: string | null;
};

export type PriorityQuoteRow = QuoteListRow & {
  earliestDeliveryDate: string;
};

export type QuoteDetailRow = QuoteRow & {
  customer: Pick<
    typeof customers.$inferSelect,
    'address' | 'companyName' | 'contactPerson' | 'email' | 'phone' | 'thumbnailDataUrl' | 'vatNumber'
  >;
  jobs: Pick<typeof jobs.$inferSelect, 'code' | 'id'>[];
  product: Pick<
    typeof products.$inferSelect,
    'buildTimeDays' | 'currencyCode' | 'description' | 'modelCode' | 'name' | 'requiresVinNumber' | 'thumbnailDataUrl'
  > | null;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'image' | 'name'> | null;
  lineItems: QuoteLineItemRow[];
  selectedAssemblies: QuoteSelectedAssemblyRow[];
};

export function mapQuote(row: QuoteRow) {
  return Quote.parse({
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    customerId: row.customerId,
    depositPercent: row.depositPercent,
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountPercent: row.discountPercent,
    id: row.id,
    notes: row.notes,
    documentNotes: row.documentNotes,
    plannedDeliveryDate: row.plannedDeliveryDate,
    preferredDeliveryDate: row.preferredDeliveryDate,
    quotedBasePrice: row.quotedBasePrice,
    quotedCurrencyCode: row.quotedCurrencyCode,
    salesPersonId: row.salesPersonId,
    status: row.status,
    statusChangedAt: row.statusChangedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    validUntil: row.validUntil,
    ...narrowQuoteOffering(row),
  });
}

export function mapQuoteSummary(
  row: QuoteListRow,
  job: QuoteLinkedJobRow | null,
  lineItems: readonly QuoteLineItemRow[],
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): QuoteSummary {
  return {
    ...mapQuote(row.quote),
    customerCompanyName: row.customerCompanyName,
    customerThumbnailDataUrl: row.customerThumbnailDataUrl,
    job: job ? mapQuoteLinkedJob(job) : null,
    productBuildTimeDays: row.productBuildTimeDays,
    productCurrencyCode: row.productCurrencyCode === null ? null : ProductCurrencyCode.parse(row.productCurrencyCode),
    productModelCode: row.productModelCode,
    productName: row.productName,
    salesPersonEmail: row.salesPersonEmail,
    salesPersonName: row.salesPersonName,
    salesPersonThumbnailDataUrl: row.salesPersonThumbnailDataUrl,
    lineItems: lineItems.map(mapQuoteLineItem),
    selectedAssemblies: selectedAssemblies.map(mapQuoteSelectedAssembly),
  };
}

export function mapPriorityQuote(
  row: PriorityQuoteRow,
  job: QuoteLinkedJobRow | null,
  lineItems: readonly QuoteLineItemRow[],
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): PriorityQuote {
  return {
    ...mapQuoteSummary(row, job, lineItems, selectedAssemblies),
    earliestDeliveryDate: DateOnlyIso.parse(row.earliestDeliveryDate),
  };
}

export function mapUpcomingDeliveryQuote(
  row: QuoteListRow,
  job: QuoteLinkedJobRow | null,
  lineItems: readonly QuoteLineItemRow[],
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): UpcomingDeliveryQuote {
  const summary = mapQuoteSummary(row, job, lineItems, selectedAssemblies);

  // Spread narrows `plannedDeliveryDate` from nullable to required, which the discriminated-union
  // return type only correlates through a parse.
  return UpcomingDeliveryQuote.parse({
    ...summary,
    plannedDeliveryDate: DateOnlyIso.parse(row.quote.plannedDeliveryDate),
  });
}

export function mapQuoteDetail(
  row: QuoteDetailRow,
  productAssembliesForQuote: Assembly[],
  productBaysForQuote: ProductBay[],
): QuoteDetail {
  return {
    ...mapQuote(row),
    customerAddress: row.customer.address,
    customerCompanyName: row.customer.companyName,
    customerContactPerson: row.customer.contactPerson,
    customerEmail: row.customer.email,
    customerPhone: row.customer.phone,
    customerThumbnailDataUrl: row.customer.thumbnailDataUrl,
    customerVatNumber: row.customer.vatNumber,
    job: row.jobs[0] ? mapQuoteLinkedJob({ jobCode: row.jobs[0].code, jobId: row.jobs[0].id }) : null,
    productCurrencyCode: row.product ? ProductCurrencyCode.parse(row.product.currencyCode) : null,
    productBuildTimeDays: row.product?.buildTimeDays ?? null,
    productDescription: row.product?.description ?? null,
    productModelCode: row.product?.modelCode ?? null,
    productName: row.product?.name ?? null,
    productAssemblies: productAssembliesForQuote,
    productBays: productBaysForQuote,
    productRequiresVinNumber: row.product?.requiresVinNumber ?? null,
    productThumbnailDataUrl: row.product?.thumbnailDataUrl ?? null,
    salesPersonEmail: row.salesPerson?.email ?? null,
    salesPersonName: row.salesPerson?.name ?? null,
    salesPersonThumbnailDataUrl: row.salesPerson?.image ?? null,
    lineItems: row.lineItems.map(mapQuoteLineItem),
    selectedAssemblies: row.selectedAssemblies.map(mapQuoteSelectedAssembly),
  };
}

export function mapQuoteLinkedJob(job: Pick<QuoteLinkedJobRow, 'jobCode' | 'jobId'>) {
  return {
    jobCode: JobCode.parse(job.jobCode),
    jobId: job.jobId,
  };
}
