import { z } from 'zod';

import { createPagedQueryResult, PagedQueryInput } from '../common/pagination.js';
import { SortDirection } from '../common/sort.js';
import { UUID } from '../common/uuid.js';
import { Supplier, SupplierCompanyName } from '../suppliers/supplier.js';

export type PartName = z.infer<typeof PartName>;
export const PartName = z.string().trim().min(1, 'Part name is required');

export type PartCode = z.infer<typeof PartCode>;
export const PartCode = z.string().trim().min(1, 'Part code is required');

export type PartSupplierCode = z.infer<typeof PartSupplierCode>;
export const PartSupplierCode = z.string().trim().min(1, 'Supplier code is required');

export type PartDrawingCode = z.infer<typeof PartDrawingCode>;
export const PartDrawingCode = z.string().trim().min(1).nullable();

export type PartDrawingCodeInput = z.infer<typeof PartDrawingCodeInput>;
export const PartDrawingCodeInput = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null);

export type PartDescription = z.infer<typeof PartDescription>;
export const PartDescription = z.string().trim().min(1, 'Description is required');

export type PartFinish = z.infer<typeof PartFinish>;
export const PartFinish = z.string().trim().min(1, 'Finish is required');

export type PartCategory = z.infer<typeof PartCategory>;
export const PartCategory = z.string().trim().min(1, 'Category is required');

export type Part = z.infer<typeof Part>;
export const Part = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: PartDrawingCode,
  finish: PartFinish,
  id: UUID,
  name: PartName,
  supplier: Supplier.pick({ companyName: true, id: true }),
  supplierCode: PartSupplierCode,
  supplierId: UUID,
});

export type PartSortBy = z.infer<typeof PartSortBy>;
export const PartSortBy = z.enum(['category', 'code', 'id', 'name', 'supplierCode', 'supplierName']);

export type PartColumnFilters = z.infer<typeof PartColumnFilters>;
export const PartColumnFilters = z
  .object({
    category: z.string().trim().optional(),
    code: z.string().trim().optional(),
    id: z.string().trim().optional(),
    name: z.string().trim().optional(),
    supplierCode: z.string().trim().optional(),
    supplierName: z.string().trim().optional(),
  })
  .default({});

export type PartCreateInput = z.infer<typeof PartCreateInput>;
export const PartCreateInput = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: PartDrawingCodeInput,
  finish: PartFinish,
  name: PartName,
  supplierCode: PartSupplierCode,
  supplierId: UUID,
});

export type PartUpdateInput = z.infer<typeof PartUpdateInput>;
export const PartUpdateInput = PartCreateInput.extend({
  id: UUID,
});

export type PartBulkImportRow = z.infer<typeof PartBulkImportRow>;
export const PartBulkImportRow = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: PartDrawingCodeInput,
  finish: PartFinish,
  lineNumber: z.number().int().min(1),
  name: PartName,
  supplierCode: PartSupplierCode,
  supplierName: SupplierCompanyName,
});

export type PartBulkImportInput = z.infer<typeof PartBulkImportInput>;
export const PartBulkImportInput = z.object({
  rows: z.array(PartBulkImportRow).min(1, 'At least one part row is required'),
});

export type PartBulkImportResult = z.infer<typeof PartBulkImportResult>;
export const PartBulkImportResult = z.object({
  errors: z.array(z.string()),
  importedCount: z.number().int().min(0),
  updatedCount: z.number().int().min(0),
});

export type PartListInput = z.infer<typeof PartListInput>;
export const PartListInput = PagedQueryInput.extend({
  search: z.string().trim().default(''),
  category: z.string().trim().optional(),
  columnFilters: PartColumnFilters,
  sortBy: PartSortBy.default('name'),
  sortDirection: SortDirection.default('asc'),
});

export type PartListResult = z.infer<typeof PartListResult>;
export const PartListResult = createPagedQueryResult(Part).extend({
  sortBy: PartSortBy,
  sortDirection: SortDirection,
});

export type PartCategoryListResult = z.infer<typeof PartCategoryListResult>;
export const PartCategoryListResult = z.object({
  categories: z.array(PartCategory),
});
