import type { customers, jobs, products, productUnits, quotes, user } from '@pkg/db';
import {
  type Assembly,
  type CompetingAllocationQuote,
  DateOnlyIso,
  JobCode,
  type PriorityQuote,
  type ProductBay,
  ProductCurrencyCode,
  Quote,
  QuoteDetail,
  type QuoteProductDetailFacts,
  type QuoteProductSummaryFacts,
  QuoteSummary,
  UpcomingDeliveryQuote,
} from '@pkg/schema';

import { narrowQuoteOffering } from './quote-offering.js';
import { mapQuoteSelectedAssembly, type QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';
import { mapQuoteWorkItem, type QuoteWorkItemRow } from './quote-work-items.js';

export type QuoteRow = typeof quotes.$inferSelect;

export type QuoteListRow = {
  quote: QuoteRow;
  customerCompanyName: string;
  customerThumbnailDataUrl: string | null;
  productBuildTimeDays: number | null;
  productCurrencyCode: string | null;
  productModelCode: string | null;
  productName: string | null;
  productThumbnailDataUrl: string | null;
  salesPersonEmail: string | null;
  salesPersonName: string | null;
  salesPersonThumbnailDataUrl: string | null;
};

export type QuoteLinkedJobRow = {
  jobCode: number;
  jobDescription: string | null;
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
  jobs: Pick<typeof jobs.$inferSelect, 'cancelledAt' | 'code' | 'description' | 'id'>[];
  product: Pick<
    typeof products.$inferSelect,
    'buildTimeDays' | 'currencyCode' | 'description' | 'modelCode' | 'name' | 'requiresVinNumber' | 'thumbnailDataUrl'
  > | null;
  productUnit: Pick<typeof productUnits.$inferSelect, 'id' | 'productSerialNumber' | 'vinNumber'> | null;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'image' | 'name'> | null;
  selectedAssemblies: QuoteSelectedAssemblyRow[];
  workItems: QuoteWorkItemRow[];
};

export function mapQuote(row: QuoteRow) {
  return Quote.parse({
    cancellationReason: row.cancellationReason,
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    customerId: row.customerId,
    depositPercent: row.depositPercent,
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountPercent: row.discountPercent,
    id: row.id,
    invoiceNumber: row.invoiceNumber,
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
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
  workItems: readonly QuoteWorkItemRow[],
): QuoteSummary {
  return QuoteSummary.parse({
    ...mapQuote(row.quote),
    customerCompanyName: row.customerCompanyName,
    customerThumbnailDataUrl: row.customerThumbnailDataUrl,
    job: job ? mapQuoteLinkedJob(job) : null,
    product: mapQuoteSummaryProduct(row),
    salesPersonEmail: row.salesPersonEmail,
    salesPersonName: row.salesPersonName,
    salesPersonThumbnailDataUrl: row.salesPersonThumbnailDataUrl,
    selectedAssemblies: selectedAssemblies.map(mapQuoteSelectedAssembly),
    workItems: workItems.map(mapQuoteWorkItem),
  });
}

export function mapPriorityQuote(
  row: PriorityQuoteRow,
  job: QuoteLinkedJobRow | null,
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
  workItems: readonly QuoteWorkItemRow[],
): PriorityQuote {
  return {
    ...mapQuoteSummary(row, job, selectedAssemblies, workItems),
    earliestDeliveryDate: DateOnlyIso.parse(row.earliestDeliveryDate),
  };
}

export function mapUpcomingDeliveryQuote(
  row: QuoteListRow,
  job: QuoteLinkedJobRow | null,
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
  workItems: readonly QuoteWorkItemRow[],
): UpcomingDeliveryQuote {
  const summary = mapQuoteSummary(row, job, selectedAssemblies, workItems);

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
  competingAllocationQuotes: CompetingAllocationQuote[],
  reworkRequired: boolean,
): QuoteDetail {
  const liveJob = row.jobs.find((job) => job.cancelledAt === null);

  return QuoteDetail.parse({
    ...mapQuote(row),
    customerAddress: row.customer.address,
    customerCompanyName: row.customer.companyName,
    customerContactPerson: row.customer.contactPerson,
    customerEmail: row.customer.email,
    customerPhone: row.customer.phone,
    customerThumbnailDataUrl: row.customer.thumbnailDataUrl,
    customerVatNumber: row.customer.vatNumber,
    hasEverSourcedJob: row.jobs.length > 0,
    job: liveJob
      ? mapQuoteLinkedJob({
          jobCode: liveJob.code,
          jobDescription: liveJob.description,
          jobId: liveJob.id,
        })
      : null,
    product: mapQuoteDetailProduct(row, productAssembliesForQuote, productBaysForQuote),
    productUnit: row.productUnit,
    reworkRequired,
    competingAllocationQuotes,
    salesPersonEmail: row.salesPerson?.email ?? null,
    salesPersonName: row.salesPerson?.name ?? null,
    salesPersonThumbnailDataUrl: row.salesPerson?.image ?? null,
    selectedAssemblies: row.selectedAssemblies.map(mapQuoteSelectedAssembly),
    workItems: row.workItems.map(mapQuoteWorkItem),
  });
}

function mapQuoteSummaryProduct(row: QuoteListRow): QuoteProductSummaryFacts | null {
  if (
    row.productBuildTimeDays === null ||
    row.productCurrencyCode === null ||
    row.productModelCode === null ||
    row.productName === null
  ) {
    return null;
  }

  return {
    buildTimeDays: row.productBuildTimeDays,
    currencyCode: ProductCurrencyCode.parse(row.productCurrencyCode),
    modelCode: row.productModelCode,
    name: row.productName,
    thumbnailDataUrl: row.productThumbnailDataUrl,
  };
}

function mapQuoteDetailProduct(
  row: QuoteDetailRow,
  assemblies: Assembly[],
  bays: ProductBay[],
): QuoteProductDetailFacts | null {
  if (!row.product) {
    return null;
  }

  return {
    assemblies,
    bays,
    buildTimeDays: row.product.buildTimeDays,
    currencyCode: ProductCurrencyCode.parse(row.product.currencyCode),
    description: row.product.description,
    modelCode: row.product.modelCode,
    name: row.product.name,
    requiresVinNumber: row.product.requiresVinNumber,
    thumbnailDataUrl: row.product.thumbnailDataUrl,
  };
}

export function mapQuoteLinkedJob(job: Pick<QuoteLinkedJobRow, 'jobCode' | 'jobDescription' | 'jobId'>) {
  return {
    jobCode: JobCode.parse(job.jobCode),
    jobDescription: job.jobDescription,
    jobId: job.jobId,
  };
}
