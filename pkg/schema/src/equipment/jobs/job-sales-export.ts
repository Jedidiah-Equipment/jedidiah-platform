import { z } from 'zod';

import { DateOnlyIso } from '../../common/date.js';
import { Price } from '../../common/price.js';
import { SearchText } from '../../common/text.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { CustomerCompanyName } from '../customers/customer.js';
import { declareInventoryCostFields, InventoryValue } from '../inventory/inventory-cost.js';
import { ProductModelCode, ProductName } from '../products/product.js';
import { QuoteInvoiceNumber } from '../quotes/quote.js';
import { JobColumnFilters, ProductSerialNumber } from './job.js';

/**
 * One completed Job as the sales report reads it: what the machine cost us off the ledger against
 * what it sold for off its Quote, on one line an accountant can total in a spreadsheet.
 *
 * Cost and retail are deliberately not comparable to the cent — cost is stamped material only, with
 * no labour in it — so the report puts them side by side and leaves the margin to the reader rather
 * than computing one that would read as authoritative.
 */
export type JobSalesExportRow = z.infer<typeof JobSalesExportRow>;
export const JobSalesExportRow = z.object({
  /** The plant business date the Job finished. Never null: only completed Jobs reach this report. */
  completedOn: DateOnlyIso,
  /**
   * Σ(quantity × stamped unit cost) over the Job's draws, net of returns — never re-priced at
   * today's average. Null when the Job still holds material no cost has been established for,
   * because reporting unpriced material as free is the one thing a cost report must not do.
   */
  costExVat: InventoryValue,
  /** {@link costExVat} grossed up at the standard VAT rate; null exactly when it is. */
  costIncVat: InventoryValue,
  /** The Job's Customer: the Owner of its machine, or its Quote's Customer. Null reads as Stock. */
  customerCompanyName: CustomerCompanyName.nullable(),
  /** The Quote's record of the sale's invoice, blank until someone files it. */
  invoiceNumber: QuoteInvoiceNumber,
  jobCode: JobCode,
  /** Both come off the Product the machine was built as, so a Custom Job carries neither. */
  productModelCode: ProductModelCode.nullable(),
  productName: ProductName.nullable(),
  /** The machine's serial. Null on a Custom Job, which produces no Product Unit. */
  productSerialNumber: ProductSerialNumber.nullable(),
  /** Null on a Stock Build, the one Job shape with no sale behind it. */
  quoteCode: QuoteCode.nullable(),
  /** Quote Pricing's ex-VAT subtotal, and null alongside `quoteCode` when there is no Quote. */
  retailExVat: Price.nullable(),
  /** Quote Pricing's VAT-inclusive customer total. */
  retailIncVat: Price.nullable(),
});

export const JobSalesExportRowCostFields = declareInventoryCostFields(JobSalesExportRow, 'costExVat', 'costIncVat');

/**
 * The Job List's own filters, minus every pagination and sort concern: the export answers for the
 * rows the reader is looking at, and completion is not a filter it accepts — the report *is*
 * completed Jobs, so a caller cannot widen it to open work.
 */
export type JobSalesExportInput = z.infer<typeof JobSalesExportInput>;
export const JobSalesExportInput = z
  .object({
    columnFilters: JobColumnFilters,
    search: SearchText,
  })
  .strict();
