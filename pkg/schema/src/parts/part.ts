import { z } from 'zod';

import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { nullableTrimmedText, nullableTrimmedTextInput, requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';
import { Supplier, SupplierCompanyName } from '../suppliers/supplier.js';

export type PartName = z.infer<typeof PartName>;
export const PartName = requiredTrimmedText('Part name is required');

export type PartCode = z.infer<typeof PartCode>;
export const PartCode = requiredTrimmedText('Part code is required');

export type PartSupplierCode = z.infer<typeof PartSupplierCode>;
export const PartSupplierCode = requiredTrimmedText('Supplier code is required');

export type PartDrawingCode = z.infer<typeof PartDrawingCode>;
export const PartDrawingCode = nullableTrimmedText();

export type PartDrawingCodeInput = z.infer<typeof PartDrawingCodeInput>;
export const PartDrawingCodeInput = nullableTrimmedTextInput();

export type PartDescription = z.infer<typeof PartDescription>;
export const PartDescription = requiredTrimmedText('Description is required');

export type PartFinish = z.infer<typeof PartFinish>;
export const PartFinish = requiredTrimmedText('Finish is required');

export type PartCategory = z.infer<typeof PartCategory>;
export const PartCategory = requiredTrimmedText('Category is required');

export type PartUnitOfMeasure = z.infer<typeof PartUnitOfMeasure>;
export const PartUnitOfMeasure = z.enum(['quantity', 'mm']);

export const PART_UNIT_OF_MEASURE_LABELS = {
  mm: 'Millimetres',
  quantity: 'Quantity',
} as const satisfies Record<PartUnitOfMeasure, string>;

export type Part = z.infer<typeof Part>;
export const Part = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: PartDrawingCode,
  finish: PartFinish,
  id: UUID,
  isInternallyFabricated: z.boolean(),
  name: PartName,
  supplier: Supplier.pick({ companyName: true, id: true }),
  supplierCode: PartSupplierCode,
  supplierId: UUID,
  unitOfMeasure: PartUnitOfMeasure,
});

export type PartSortBy = z.infer<typeof PartSortBy>;
export const PartSortBy = z.enum(['category', 'code', 'id', 'name', 'supplierCode', 'supplierName']);

export type PartColumnFilters = z.infer<typeof PartColumnFilters>;
export const PartColumnFilters = z
  .object({
    category: z.string().trim().optional(),
    code: z.string().trim().optional(),
    id: z.string().trim().optional(),
    isInternallyFabricated: z.boolean().optional(),
    name: z.string().trim().optional(),
    supplierCode: z.string().trim().optional(),
    supplierName: z.string().trim().optional(),
    unitOfMeasure: PartUnitOfMeasure.optional(),
  })
  .default({});

export type PartCreateInput = z.infer<typeof PartCreateInput>;
export const PartCreateInput = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: PartDrawingCodeInput,
  finish: PartFinish,
  isInternallyFabricated: z.boolean().default(false),
  name: PartName,
  supplierCode: PartSupplierCode,
  supplierId: UUID,
  unitOfMeasure: PartUnitOfMeasure,
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
  isInternallyFabricated: z.boolean(),
  lineNumber: z.number().int().min(1),
  name: PartName,
  supplierCode: PartSupplierCode,
  supplierName: SupplierCompanyName,
  unitOfMeasure: PartUnitOfMeasure,
});

export type PartBulkImportInput = z.infer<typeof PartBulkImportInput>;
export const PartBulkImportInput = z.object({
  rows: z.array(PartBulkImportRow).min(1, 'At least one part row is required'),
  supplierId: UUID.optional(),
});

export type PartBulkImportResult = z.infer<typeof PartBulkImportResult>;
export const PartBulkImportResult = z.object({
  errors: z.array(z.string()),
  importedCount: z.number().int().min(0),
  updatedCount: z.number().int().min(0),
});

export type PartListInput = z.infer<typeof PartListInput>;
export const PartListInput = createSearchedSortedPagedQueryInput({
  shape: {
    category: z.string().trim().optional(),
    columnFilters: PartColumnFilters,
    supplierId: UUID.optional(),
  },
  sortBy: PartSortBy.default('name'),
});

export type PartListResult = z.infer<typeof PartListResult>;
export const PartListResult = createSortedPagedQueryResult(Part, PartSortBy);

export type PartCategoryListResult = z.infer<typeof PartCategoryListResult>;
export const PartCategoryListResult = z.object({
  categories: z.array(PartCategory),
});
