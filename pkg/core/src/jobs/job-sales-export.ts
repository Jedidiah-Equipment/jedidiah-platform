import { type Db, jobs } from '@pkg/db';
import { computeQuoteVatAmount, resolveJobCustomer, resolveNewestOwnershipTransfer } from '@pkg/domain';
import { type JobSalesExportInput, JobSalesExportRow, UUID } from '@pkg/schema';
import { and, asc, isNotNull } from 'drizzle-orm';

import { readJobDrawnCost, sumJobDrawnCosts } from '../inventory/job-cost-read.js';
import { loadQuoteAssociations } from '../quotes/quote-read-service.js';
import { priceReportQuote } from '../quotes/quote-report-pricing.js';
import { buildJobListWhere } from './job-read-service.js';

/**
 * Every completed Job as one spreadsheet line: what it cost us in material off the ledger, what it
 * sold for off its Quote, and the numbers a bookkeeper reconciles it by — Job, Quote and invoice
 * codes, the Customer, the machine's serial, and the date it finished.
 *
 * It is deliberately unpaginated. The reader is exporting a period to total in Excel, and a CSV
 * silently short of its last page would be worse than a slow one; the filters are what bound it.
 *
 * Completion is the report's subject rather than one of its filters: only a Job with a `completedOn`
 * appears, whatever the caller asks for. A Cancelled Job is excluded by the Job List's own filter,
 * which is the same rule reading from the other side — a cancelled Job is abandoned, never completed.
 */
export async function listCompletedJobSales({
  db,
  input,
}: {
  db: Db;
  input: JobSalesExportInput;
}): Promise<JobSalesExportRow[]> {
  const rows = await db.query.jobs.findMany({
    columns: { code: true, completedOn: true, id: true, productUnitId: true, quoteId: true },
    // Oldest completion first: the export reads as a period, and a period reads forwards.
    orderBy: [asc(jobs.completedOn), asc(jobs.code)],
    where: and(
      buildJobListWhere({ columnFilters: input.columnFilters, search: input.search }),
      isNotNull(jobs.completedOn),
    ),
    with: {
      productUnit: {
        columns: { productSerialNumber: true },
        with: {
          ownershipTransfers: {
            columns: { createdAt: true, id: true, occurredOn: true, toCustomerId: true },
            with: { toCustomer: { columns: { companyName: true, id: true, thumbnailDataUrl: true } } },
          },
          product: { columns: { modelCode: true, name: true } },
        },
      },
      quote: {
        columns: {
          code: true,
          deliveryIncluded: true,
          deliveryPrice: true,
          discountPercent: true,
          invoiceNumber: true,
          kind: true,
          quotedBasePrice: true,
        },
        with: { customer: { columns: { companyName: true, id: true, thumbnailDataUrl: true } } },
      },
    },
  });

  const [costByJobId, { selectedAssembliesByQuoteId, workItemsByQuoteId }] = await Promise.all([
    sumJobDrawnCosts({ db, jobIds: rows.map((row) => UUID.parse(row.id)) }),
    loadQuoteAssociations({
      db,
      quoteIds: rows.flatMap((row) => (row.quoteId ? [UUID.parse(row.quoteId)] : [])),
    }),
  ]);

  return rows.map((row) => {
    const jobId = UUID.parse(row.id);
    const quoteId = row.quoteId ? UUID.parse(row.quoteId) : null;
    const pricing =
      row.quote && quoteId
        ? priceReportQuote({
            row: row.quote,
            selectedAssemblies: selectedAssembliesByQuoteId.get(quoteId) ?? [],
            workItems: workItemsByQuoteId.get(quoteId) ?? [],
          })
        : null;
    const costExVat = readJobDrawnCost(costByJobId, jobId);
    const customer = resolveJobCustomer({
      productUnit: row.productUnit
        ? { owner: resolveNewestOwnershipTransfer(row.productUnit.ownershipTransfers)?.toCustomer ?? null }
        : null,
      quoteCustomer: row.quote?.customer ?? null,
    });

    return JobSalesExportRow.parse({
      completedOn: row.completedOn,
      costExVat,
      // Grossed up through the same helper Quote Pricing uses, so both halves of the line answer to
      // one VAT rule rather than two that could drift apart.
      costIncVat: costExVat === null ? null : costExVat + computeQuoteVatAmount(costExVat),
      customerCompanyName: customer?.companyName ?? null,
      invoiceNumber: row.quote?.invoiceNumber ?? null,
      jobCode: row.code,
      productModelCode: row.productUnit?.product?.modelCode ?? null,
      productName: row.productUnit?.product?.name ?? null,
      productSerialNumber: row.productUnit?.productSerialNumber ?? null,
      quoteCode: row.quote?.code ?? null,
      retailExVat: pricing?.subtotal ?? null,
      retailIncVat: pricing?.total ?? null,
    });
  });
}
