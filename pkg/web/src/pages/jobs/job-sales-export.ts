import { formatDate } from '@pkg/domain';
import type { JobSalesExportRow } from '@pkg/schema';
import Papa from 'papaparse';

import { downloadFile } from '@/utils/download-file.js';

export const JOB_SALES_EXPORT_COLUMNS = [
  'job_number',
  'quote_number',
  'invoice_number',
  'customer',
  'product_modelcode',
  'product_name',
  'serial_number',
  'date_completed',
  'cost_ex_vat',
  'cost_inc_vat',
  'retail_ex_vat',
  'retail_inc_vat',
] as const;

/**
 * The report as a spreadsheet reads it. Money is written to the cent so a column of it sums without
 * the reader reformatting anything, and a figure we do not have stays an empty cell — a cost nobody
 * has priced yet must never arrive in Excel as a zero that totals.
 */
export function buildJobSalesExportCsv(rows: readonly JobSalesExportRow[]): string {
  return Papa.unparse(
    {
      fields: [...JOB_SALES_EXPORT_COLUMNS],
      data: rows.map((row) => [
        row.jobCode,
        row.quoteCode ?? '',
        row.invoiceNumber ?? '',
        row.customerCompanyName ?? '',
        row.productModelCode ?? '',
        row.productName ?? '',
        row.productSerialNumber ?? '',
        row.completedOn,
        toAmount(row.costExVat),
        toAmount(row.costIncVat),
        toAmount(row.retailExVat),
        toAmount(row.retailIncVat),
      ]),
    },
    { escapeFormulae: true },
  );
}

export function createJobSalesExportFilename(date: Date): string {
  return `completed-jobs-${formatDate(date, 'yyyy-MM-dd')}.csv`;
}

export function downloadJobSalesExport(rows: readonly JobSalesExportRow[], date = new Date()): void {
  downloadFile(buildJobSalesExportCsv(rows), createJobSalesExportFilename(date), 'text/csv;charset=utf-8');
}

function toAmount(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}
