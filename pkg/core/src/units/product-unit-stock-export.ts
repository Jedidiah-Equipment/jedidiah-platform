import { type Db, jobs, products, productUnitOwnershipTransfers, productUnits } from '@pkg/db';
import { computeQuoteVatAmount, resolveNewestOwnershipTransfer } from '@pkg/domain';
import { type ProductUnitStockExportInput, ProductUnitStockExportRow, UUID } from '@pkg/schema';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { sumJobDrawnCosts } from '../inventory/job-cost-read.js';
import { groupBy, sumNullableBy } from '../inventory/row-grouping.js';
import { buildProductUnitListWhere, productUnitBuildCompletedOn } from './product-unit-read-service.js';

/**
 * Every On Hand Product Unit as one spreadsheet line: what the machine cost us in material off the
 * ledger, what its Product lists for, and the numbers a bookkeeper reconciles it by — Job, Quote and
 * Invoice Numbers, the Customer holding it, its Serial Number, and the date its build finished.
 *
 * It is deliberately unpaginated, for the same reason the Job sales export is: the reader is valuing a
 * yard to total in Excel, and a CSV silently short of its last page would be worse than a slow one.
 *
 * Being On Hand is the report's subject rather than one of its filters — a Unit with no Job Completion
 * behind it is still In Build, has no completion date to report, and carries a cost that is a
 * work-in-progress figure rather than what a machine cost. Every other Units-list filter still applies,
 * so **On Hand** narrows to the machines we still hold and **Complete** to the ones already sold.
 */
export async function listOnHandProductUnitStock({
  db,
  input,
}: {
  db: Db;
  input: ProductUnitStockExportInput;
}): Promise<ProductUnitStockExportRow[]> {
  const rows = await db
    .select({
      buildCompletedOn: sql<string>`${productUnitBuildCompletedOn}`,
      id: productUnits.id,
      productBasePrice: products.basePrice,
      productModelCode: products.modelCode,
      productName: products.name,
      productSerialNumber: productUnits.productSerialNumber,
    })
    .from(productUnits)
    .innerJoin(products, eq(products.id, productUnits.productId))
    .where(and(buildProductUnitListWhere(input), sql`${productUnitBuildCompletedOn} is not null`))
    // Oldest build first: the export reads as a period, and a period reads forwards.
    .orderBy(asc(productUnitBuildCompletedOn), asc(productUnits.productSerialNumber));

  if (rows.length === 0) {
    return [];
  }

  const unitIds = rows.map((row) => row.id);
  const [liveJobs, transfers] = await Promise.all([
    db
      .select({ code: jobs.code, id: jobs.id, productUnitId: jobs.productUnitId })
      .from(jobs)
      .where(and(inArray(jobs.productUnitId, unitIds), isNull(jobs.cancelledAt)))
      // The Build Job is the earliest, under the same ordering `productUnitBuildCompletedOn` reads.
      .orderBy(asc(jobs.createdAt), asc(jobs.id)),
    db.query.productUnitOwnershipTransfers.findMany({
      columns: { createdAt: true, id: true, occurredOn: true, productUnitId: true, toCustomerId: true },
      where: inArray(productUnitOwnershipTransfers.productUnitId, unitIds),
      with: {
        sourceQuote: { columns: { code: true, invoiceNumber: true } },
        toCustomer: { columns: { companyName: true } },
      },
    }),
  ]);

  const jobsByUnitId = groupBy(liveJobs, (job) => job.productUnitId);
  const transfersByUnitId = groupBy(transfers, (transfer) => transfer.productUnitId);
  const costByJobId = await sumJobDrawnCosts({ db, jobIds: liveJobs.map((job) => UUID.parse(job.id)) });

  return rows.map((row) => {
    // Never empty: a Unit reaches this report only through a live Job carrying a Job Completion.
    const unitJobs = jobsByUnitId.get(row.id) ?? [];
    // A Job absent from the cost map drew nothing at all, which cost zero; only material nobody has
    // priced yet makes a cost unknowable, and that arrives as an explicit null against the Job.
    const costExVat = sumNullableBy(unitJobs, (job) => {
      const jobId = UUID.parse(job.id);

      return costByJobId.has(jobId) ? (costByJobId.get(jobId) ?? null) : 0;
    });
    // The Transfer that decides who holds the machine also names the sale that put it there: the
    // build's Quote for one built to order, the Allocation Quote for one sold out of stock. A
    // hand-recorded transfer carries neither, because we were not part of that transaction.
    const owningTransfer = resolveNewestOwnershipTransfer(transfersByUnitId.get(row.id) ?? []);

    return ProductUnitStockExportRow.parse({
      buildCompletedOn: row.buildCompletedOn,
      costExVat,
      // Grossed up through the same helper Quote Pricing uses, so every figure on the line answers to
      // one VAT rule rather than several that could drift apart.
      costIncVat: costExVat === null ? null : costExVat + computeQuoteVatAmount(costExVat),
      customerCompanyName: owningTransfer?.toCustomer?.companyName ?? null,
      invoiceNumber: owningTransfer?.sourceQuote?.invoiceNumber ?? null,
      jobCode: unitJobs[0]?.code,
      productModelCode: row.productModelCode,
      productName: row.productName,
      productRetailExVat: row.productBasePrice,
      productRetailIncVat: row.productBasePrice + computeQuoteVatAmount(row.productBasePrice),
      productSerialNumber: row.productSerialNumber,
      quoteCode: owningTransfer?.sourceQuote?.code ?? null,
    });
  });
}
