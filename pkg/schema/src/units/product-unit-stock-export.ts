import { z } from 'zod';

import { DateOnlyIso } from '../common/date.js';
import { Price } from '../common/price.js';
import { JobCode, QuoteCode } from '../common/public-code.js';
import { SearchText } from '../common/text.js';
import { CustomerCompanyName } from '../customers/customer.js';
import { declareInventoryCostFields, InventoryValue } from '../inventory/inventory-cost.js';
import { ProductSerialNumber } from '../jobs/job.js';
import { ProductModelCode, ProductName } from '../products/product.js';
import { QuoteInvoiceNumber } from '../quotes/quote.js';
import { ProductUnitColumnFilters } from './product-unit.js';

/**
 * One On Hand Product Unit as the stock valuation reads it: what the machine cost us in material off
 * the ledger against what its Product lists for, on one line an accountant can total in a spreadsheet.
 *
 * The two figures answer different questions and are deliberately not comparable to the cent — cost is
 * stamped material only, with no labour in it, and retail is the Product's price today rather than what
 * any one machine fetched — so the report puts them side by side and computes no margin.
 */
export type ProductUnitStockExportRow = z.infer<typeof ProductUnitStockExportRow>;
export const ProductUnitStockExportRow = z.object({
  /**
   * The Job Completion of the Unit's Build Job, which is what makes it On Hand. Never null: a Unit
   * without one is still In Build, and this report is On Hand Units.
   */
  buildCompletedOn: DateOnlyIso,
  /**
   * Σ(quantity × stamped unit cost) over every draw against the Unit's live Jobs, net of returns and
   * never re-priced at today's average. Null when any of those Jobs still holds material no cost has
   * been established for, because reporting unpriced material as free is the one thing a cost report
   * must not do.
   */
  costExVat: InventoryValue,
  /** {@link costExVat} grossed up at the standard VAT rate; null exactly when it is. */
  costIncVat: InventoryValue,
  /** The Customer holding the machine now. Null reads as Stock: we still hold it. */
  customerCompanyName: CustomerCompanyName.nullable(),
  /** The sourcing Quote's record of the sale's invoice, blank until someone files it. */
  invoiceNumber: QuoteInvoiceNumber,
  /** The Unit's Build Job — its earliest live Job, the one whose completion this row reports. */
  jobCode: JobCode,
  /** Both come off the Product the machine was built as, which a Unit always has. */
  productModelCode: ProductModelCode,
  productName: ProductName,
  /**
   * The Product's base price as the catalog holds it today, ex-VAT and grossed up. It is the list
   * price of the model, not what this machine sold for — {@link quoteCode} and {@link invoiceNumber}
   * are the pointer to that.
   */
  productRetailExVat: Price,
  productRetailIncVat: Price,
  productSerialNumber: ProductSerialNumber,
  /**
   * The Quote behind the Unit's current ownership: its build's Quote for a machine built to order,
   * the Allocation Quote for one sold out of stock. Null on a Unit we still hold, and on one that
   * changed hands in a transfer recorded by hand, which carries no Quote of ours.
   */
  quoteCode: QuoteCode.nullable(),
});

export const ProductUnitStockExportRowCostFields = declareInventoryCostFields(
  ProductUnitStockExportRow,
  'costExVat',
  'costIncVat',
);

/**
 * The Units list's own filters, minus every pagination and sort concern: the export answers for the
 * rows the reader is looking at. Build State stays among them — unlike Job completion, it is a filter
 * a person drives — so narrowing to the machines we still hold is the list's own **On Hand** choice.
 */
export type ProductUnitStockExportInput = z.infer<typeof ProductUnitStockExportInput>;
export const ProductUnitStockExportInput = z
  .object({
    columnFilters: ProductUnitColumnFilters,
    search: SearchText,
  })
  .strict();
