import { type Db, jobs, products, productUnitOwnershipTransfers, productUnits } from '@pkg/db';
import { computeQuoteVatAmount, resolveNewestOwnershipTransfer } from '@pkg/domain';
import { type ProductUnitStockExportInput, ProductUnitStockExportRow, UUID } from '@pkg/schema';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { readJobDrawnCost, sumJobDrawnCosts } from '../inventory/job-cost-read.js';
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
 * work-in-progress figure rather than what a machine cost. Every Units-list filter that can narrow that
 * subject still applies, so **On Hand** gives the machines we still hold and **Complete** the ones
 * already sold; only **In Build** is dropped, because a filter contradicting the subject would return an
 * empty report rather than a narrower one. That is the same rule under which the Job sales export
 * ignores the Job List's Include Completed switch.
 *
 * The Units read is an explicit `select` with batched follow-ups rather than one relational `findMany`,
 * which is what this package prefers. It has to be: the Units list's filters and this report's subject
 * are correlated subqueries over `productUnits`, and the relational builder rewrites the column
 * references inside embedded SQL to its own alias for the outer table — `jobs.completed_on` comes out as
 * `productUnits.completed_on` and the query will not even parse. The Job sales export can use `findMany`
 * because none of its filters are correlated subqueries.
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
      id: productUnits.id,
      productBasePrice: products.basePrice,
      productModelCode: products.modelCode,
      productName: products.name,
      productSerialNumber: productUnits.productSerialNumber,
    })
    .from(productUnits)
    .innerJoin(products, eq(products.id, productUnits.productId))
    .where(and(buildProductUnitListWhere(withoutInBuildFilter(input)), sql`${productUnitBuildCompletedOn} is not null`))
    // Oldest build first: the export reads as a period, and a period reads forwards.
    .orderBy(asc(productUnitBuildCompletedOn), asc(productUnits.productSerialNumber));

  if (rows.length === 0) {
    return [];
  }

  const unitIds = rows.map((row) => row.id);
  const [liveJobs, transfers] = await Promise.all([
    db
      .select({ code: jobs.code, completedOn: jobs.completedOn, id: jobs.id, productUnitId: jobs.productUnitId })
      .from(jobs)
      .where(and(inArray(jobs.productUnitId, unitIds), isNull(jobs.cancelledAt)))
      // Ordered as `productUnitBuildCompletedOn` reads them, so each Unit's first is its Build Job and
      // the date this report puts against a machine is the one that admitted it.
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
    const unitJobs = jobsByUnitId.get(row.id);
    const buildJob = unitJobs?.[0];

    if (!unitJobs || !buildJob?.completedOn) {
      // Unreachable: a Unit is admitted only when its earliest live Job carries a Job Completion.
      throw new Error(`Product Unit ${row.id} reads as On Hand with no completed live Job behind it`);
    }

    // Every Job the machine has been through, summed. One unpriced Job latches the whole Unit
    // unpriced, exactly as one unpriced Part latches a Job: a machine is no better priced than its
    // worst known Job, and a total quietly counting that material as free would read as authoritative.
    const costExVat = sumNullableBy(unitJobs, (job) => readJobDrawnCost(costByJobId, UUID.parse(job.id)));
    // The Transfer that decides who holds the machine also names the sale that put it there: the
    // build's Quote for one built to order, the Allocation Quote for one sold out of stock. A
    // hand-recorded transfer carries neither, because we were not part of that transaction.
    const owningTransfer = resolveNewestOwnershipTransfer(transfersByUnitId.get(row.id) ?? []);

    return ProductUnitStockExportRow.parse({
      buildCompletedOn: buildJob.completedOn,
      costExVat,
      // Grossed up through the same helper Quote Pricing uses, so every figure on the line answers to
      // one VAT rule rather than several that could drift apart.
      costIncVat: costExVat === null ? null : costExVat + computeQuoteVatAmount(costExVat),
      customerCompanyName: owningTransfer?.toCustomer?.companyName ?? null,
      invoiceNumber: owningTransfer?.sourceQuote?.invoiceNumber ?? null,
      jobCode: buildJob.code,
      productModelCode: row.productModelCode,
      productName: row.productName,
      productRetailExVat: row.productBasePrice,
      productRetailIncVat: row.productBasePrice + computeQuoteVatAmount(row.productBasePrice),
      productSerialNumber: row.productSerialNumber,
      quoteCode: owningTransfer?.sourceQuote?.code ?? null,
    });
  });
}

/** The one Build State that cannot narrow this report, dropped so it cannot empty it instead. */
function withoutInBuildFilter(input: ProductUnitStockExportInput): ProductUnitStockExportInput {
  return input.columnFilters.buildState === 'in-build'
    ? { ...input, columnFilters: { ...input.columnFilters, buildState: undefined } }
    : input;
}
