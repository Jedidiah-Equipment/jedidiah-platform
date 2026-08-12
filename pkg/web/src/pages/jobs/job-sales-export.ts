import { formatDate } from '@pkg/domain';
import type { JobSalesExportRow } from '@pkg/schema';
import Papa from 'papaparse';

import { downloadCsv, toCsvAmount } from '@/utils/csv-export.js';

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

/** The report as a spreadsheet reads it; money follows {@link toCsvAmount}. */
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
        toCsvAmount(row.costExVat),
        toCsvAmount(row.costIncVat),
        toCsvAmount(row.retailExVat),
        toCsvAmount(row.retailIncVat),
      ]),
    },
    { escapeFormulae: true },
  );
}

export function createJobSalesExportFilename(date: Date): string {
  return `completed-jobs-${formatDate(date, 'yyyy-MM-dd')}.csv`;
}

export function downloadJobSalesExport(rows: readonly JobSalesExportRow[], date = new Date()): void {
  downloadCsv(buildJobSalesExportCsv(rows), createJobSalesExportFilename(date));
}
