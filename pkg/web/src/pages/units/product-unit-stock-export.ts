import { formatDate } from '@pkg/domain';
import type { ProductUnitStockExportRow } from '@pkg/schema';
import Papa from 'papaparse';

import { downloadFile } from '@/utils/download-file.js';

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

/**
 * The valuation as a spreadsheet reads it. Money is written to the cent so a column of it sums without
 * the reader reformatting anything, and a figure we do not have stays an empty cell — a cost nobody has
 * priced yet must never arrive in Excel as a zero that totals.
 */
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
        toAmount(row.costExVat),
        toAmount(row.costIncVat),
        toAmount(row.productRetailExVat),
        toAmount(row.productRetailIncVat),
      ]),
    },
    { escapeFormulae: true },
  );
}

export function createProductUnitStockExportFilename(date: Date): string {
  return `unit-stock-${formatDate(date, 'yyyy-MM-dd')}.csv`;
}

export function downloadProductUnitStockExport(rows: readonly ProductUnitStockExportRow[], date = new Date()): void {
  downloadFile(
    buildProductUnitStockExportCsv(rows),
    createProductUnitStockExportFilename(date),
    'text/csv;charset=utf-8',
  );
}

function toAmount(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}
