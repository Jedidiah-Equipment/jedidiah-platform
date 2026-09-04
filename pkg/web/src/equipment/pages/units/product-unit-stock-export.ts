import { formatDate } from '@pkg/domain';
import type { ProductUnitStockExportRow } from '@pkg/schema/equipment';
import Papa from 'papaparse';

import { downloadCsv, toCsvAmount } from '@/utils/csv-export.js';

export const PRODUCT_UNIT_STOCK_EXPORT_COLUMNS = [
  'serial_number',
  'product_modelcode',
  'product_name',
  'job_number',
  'quote_number',
  'invoice_number',
  'customer',
  'date_completed',
  'cost_ex_vat',
  'cost_inc_vat',
  'product_retail_ex_vat',
  'product_retail_inc_vat',
] as const;

/** The valuation as a spreadsheet reads it; money follows {@link toCsvAmount}. */
export function buildProductUnitStockExportCsv(rows: readonly ProductUnitStockExportRow[]): string {
  return Papa.unparse(
    {
      fields: [...PRODUCT_UNIT_STOCK_EXPORT_COLUMNS],
      data: rows.map((row) => [
        row.productSerialNumber,
        row.productModelCode,
        row.productName,
        row.jobCode,
        row.quoteCode ?? '',
        row.invoiceNumber ?? '',
        row.customerCompanyName ?? '',
        row.buildCompletedOn,
        toCsvAmount(row.costExVat),
        toCsvAmount(row.costIncVat),
        toCsvAmount(row.productRetailExVat),
        toCsvAmount(row.productRetailIncVat),
      ]),
    },
    { escapeFormulae: true },
  );
}

export function createProductUnitStockExportFilename(date: Date): string {
  return `unit-stock-${formatDate(date, 'yyyy-MM-dd')}.csv`;
}

export function downloadProductUnitStockExport(rows: readonly ProductUnitStockExportRow[], date = new Date()): void {
  downloadCsv(buildProductUnitStockExportCsv(rows), createProductUnitStockExportFilename(date));
}
