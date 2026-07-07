import { formatDate } from '@pkg/domain';
import type { AssemblyKind } from '@pkg/schema';
import Papa from 'papaparse';

import { downloadFile } from '@/utils/download-file.js';

export type ProductAssemblyExportRow = {
  productModelCode: string;
  productName: string;
  assemblyType: AssemblyKind;
  assemblyName: string;
  assemblyPrice: string | null;
};

export const PRODUCT_ASSEMBLY_EXPORT_COLUMNS = [
  'product_modelcode',
  'product_name',
  'assembly_type',
  'assembly_name',
  'assembly_price',
] as const;

export function buildProductAssemblyExportCsv(rows: ProductAssemblyExportRow[]): string {
  return Papa.unparse({
    fields: [...PRODUCT_ASSEMBLY_EXPORT_COLUMNS],
    data: rows.map((row) => [
      row.productModelCode,
      row.productName,
      row.assemblyType,
      row.assemblyName,
      row.assemblyPrice ?? '',
    ]),
  });
}

export function createProductAssemblyExportFilename(date: Date): string {
  return `product-assemblies-${formatDate(date, 'yyyy-MM-dd')}.csv`;
}

export function downloadProductAssemblyExport(rows: ProductAssemblyExportRow[], date = new Date()): void {
  downloadFile(
    buildProductAssemblyExportCsv(rows),
    createProductAssemblyExportFilename(date),
    'text/csv;charset=utf-8',
  );
}
