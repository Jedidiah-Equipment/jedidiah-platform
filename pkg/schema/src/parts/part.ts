import { z } from 'zod';

import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../common/pagination.js';
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

export type PartStockTrackingMode = z.infer<typeof PartStockTrackingMode>;
export const PartStockTrackingMode = z.enum(['perpetual', 'periodic']);

export const PART_STOCK_TRACKING_MODE_LABELS = {
  periodic: 'Periodic',
  perpetual: 'Perpetual',
} as const satisfies Record<PartStockTrackingMode, string>;

export type PartStorageLocation = z.infer<typeof PartStorageLocation>;
export const PartStorageLocation = nullableTrimmedText();

export type PartStorageLocationInput = z.infer<typeof PartStorageLocationInput>;
export const PartStorageLocationInput = nullableTrimmedTextInput();

export type PartStandardPurchaseLengthMm = z.infer<typeof PartStandardPurchaseLengthMm>;
export const PartStandardPurchaseLengthMm = z.int().positive();

export type PartMinimumStock = z.infer<typeof PartMinimumStock>;
export const PartMinimumStock = z.int().nonnegative();

export type PartAverageUtilizationPercent = z.infer<typeof PartAverageUtilizationPercent>;
export const PartAverageUtilizationPercent = z.int().min(1).max(100);

export type PartUnitOfMeasure = z.infer<typeof PartUnitOfMeasure>;
export const PartUnitOfMeasure = z.enum(['piece', 'set', 'box', 'pair', 'mm', 'kg', 'litre']);

export const PART_UNIT_OF_MEASURE_LABELS = {
  box: 'Boxes',
  kg: 'Kilograms',
  litre: 'Litres',
  mm: 'Millimetres',
  pair: 'Pairs',
  piece: 'Pieces',
  set: 'Sets',
} as const satisfies Record<PartUnitOfMeasure, string>;

export type PartUnitClass = 'discrete' | 'linear' | 'measured';

const PART_UNIT_CLASS = {
  box: 'discrete',
  kg: 'measured',
  litre: 'measured',
  mm: 'linear',
  pair: 'discrete',
  piece: 'discrete',
  set: 'discrete',
} as const satisfies Record<PartUnitOfMeasure, PartUnitClass>;

export function unitClassFor(unitOfMeasure: PartUnitOfMeasure): PartUnitClass {
  return PART_UNIT_CLASS[unitOfMeasure];
}

/**
 * Discrete and linear Parts are counted in whole units; only measured ones take decimals. Every
 * surface that accepts a Part quantity — ledger movements, BOM lines, Purchase Order lines — asks
 * this one question and raises its own error, so the rule cannot drift between them.
 */
export function isWholeUnitQuantity(quantity: number, unitClass: PartUnitClass): boolean {
  return unitClass === 'measured' || Number.isInteger(quantity);
}

export type Part = z.infer<typeof Part>;
export const Part = z.object({
  averageUtilizationPercent: PartAverageUtilizationPercent.nullable(),
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: PartDrawingCode,
  finish: PartFinish,
  id: UUID,
  isInternallyFabricated: z.boolean(),
  minimumStock: PartMinimumStock.nullable(),
  name: PartName,
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable(),
  stockTrackingMode: PartStockTrackingMode,
  storageLocation: PartStorageLocation,
  /** Null on a Built Part, which is made in-house from a BOM and bought from nobody. */
  supplier: Supplier.pick({ companyName: true, id: true }).nullable(),
  supplierCode: PartSupplierCode,
  supplierId: UUID.nullable(),
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
    storageLocation: z.string().trim().optional(),
    supplierCode: z.string().trim().optional(),
    supplierName: z.string().trim().optional(),
    unitOfMeasure: PartUnitOfMeasure.optional(),
  })
  .default({});

const PartInputFields = z.object({
  averageUtilizationPercent: PartAverageUtilizationPercent.nullable().default(null),
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: PartDrawingCodeInput,
  finish: PartFinish,
  isInternallyFabricated: z.boolean().default(false),
  minimumStock: PartMinimumStock.nullable().default(null),
  name: PartName,
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable().default(null),
  stockTrackingMode: PartStockTrackingMode.default('perpetual'),
  storageLocation: PartStorageLocationInput,
  supplierCode: PartSupplierCode,
  supplierId: UUID.nullable().default(null),
  unitOfMeasure: PartUnitOfMeasure,
});

/** The one wording for the Supplier-XOR-BOM rule, so the entity form and the CSV row agree. */
export const PART_BUILT_HAS_NO_SUPPLIER_MESSAGE = 'A built Part is made in-house and has no Supplier';

/**
 * A Part has either a Supplier or a BOM — never both, never neither (spec §6). The stored form of
 * that invariant is the fabricated flag against `supplierId`; the BOM side is service-enforced,
 * because an empty BOM on a fabricated Part is legitimate (its components are all raw material).
 */
export function refinePartSupplier(
  input: Pick<z.infer<typeof PartInputFields>, 'isInternallyFabricated' | 'supplierId'>,
  context: z.RefinementCtx,
): void {
  if (input.isInternallyFabricated && input.supplierId !== null) {
    context.addIssue({
      code: 'custom',
      message: PART_BUILT_HAS_NO_SUPPLIER_MESSAGE,
      path: ['supplierId'],
    });
  }

  if (!input.isInternallyFabricated && input.supplierId === null) {
    context.addIssue({ code: 'custom', message: 'Select a Supplier', path: ['supplierId'] });
  }
}

export function refinePartStandardPurchaseLength(
  input: Pick<z.infer<typeof PartInputFields>, 'standardPurchaseLengthMm' | 'unitOfMeasure'>,
  context: z.RefinementCtx,
): void {
  if (input.unitOfMeasure === 'mm' && input.standardPurchaseLengthMm === null) {
    context.addIssue({
      code: 'custom',
      message: 'Standard purchase length is required for millimetre parts',
      path: ['standardPurchaseLengthMm'],
    });
  }

  if (input.unitOfMeasure !== 'mm' && input.standardPurchaseLengthMm !== null) {
    context.addIssue({
      code: 'custom',
      message: 'Standard purchase length is only valid for millimetre parts',
      path: ['standardPurchaseLengthMm'],
    });
  }
}

export function refinePartAverageUtilization(
  input: Pick<z.infer<typeof PartInputFields>, 'averageUtilizationPercent' | 'stockTrackingMode' | 'unitOfMeasure'>,
  context: z.RefinementCtx,
): void {
  if (
    input.averageUtilizationPercent !== null &&
    (input.stockTrackingMode !== 'periodic' || unitClassFor(input.unitOfMeasure) !== 'discrete')
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Average utilization is only valid for discrete periodic Parts',
      path: ['averageUtilizationPercent'],
    });
  }
}

/** The one wording for the rule, so the entity form and the CSV row agree. */
export const PART_BUILT_IS_NOT_LINEAR_MESSAGE = 'A built Part cannot be measured in millimetres';

/**
 * A Built Part is never linear. A Build posts a single row at consumed value ÷ units built, which
 * names no length bucket, so linear stock has no build to post — the state the Build event cannot
 * produce is refused here rather than left creatable and refused later.
 */
export function refinePartBuiltIsNotLinear(
  input: Pick<z.infer<typeof PartInputFields>, 'isInternallyFabricated' | 'unitOfMeasure'>,
  context: z.RefinementCtx,
): void {
  if (input.isInternallyFabricated && input.unitOfMeasure === 'mm') {
    context.addIssue({
      code: 'custom',
      message: PART_BUILT_IS_NOT_LINEAR_MESSAGE,
      path: ['unitOfMeasure'],
    });
  }
}

function refinePartInput(input: z.infer<typeof PartInputFields>, context: z.RefinementCtx): void {
  refinePartAverageUtilization(input, context);
  refinePartBuiltIsNotLinear(input, context);
  refinePartStandardPurchaseLength(input, context);
  refinePartSupplier(input, context);
}

export type PartCreateInput = z.infer<typeof PartCreateInput>;
export const PartCreateInput = PartInputFields.superRefine(refinePartInput);

export type PartUpdateInput = z.infer<typeof PartUpdateInput>;
export const PartUpdateInput = PartInputFields.extend({ id: UUID }).superRefine(refinePartInput);

/**
 * The catalog fields a bulk CSV carries, in both directions. The export writes exactly these and the
 * import reads exactly these, so a column can only be added to one by being added to both.
 */
export type PartBulkExportRow = z.infer<typeof PartBulkExportRow>;
export const PartBulkExportRow = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: PartDrawingCodeInput,
  finish: PartFinish,
  isInternallyFabricated: z.boolean(),
  name: PartName,
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable().optional(),
  supplierCode: PartSupplierCode,
  /** Absent on a built Part row, which names no Supplier because it is bought from nobody. */
  supplierName: SupplierCompanyName.nullable().default(null),
  unitOfMeasure: PartUnitOfMeasure,
});

export type PartBulkImportRow = z.infer<typeof PartBulkImportRow>;
export const PartBulkImportRow = PartBulkExportRow
  // Only the import carries a line number: it is where the row came from, not something a Part has.
  .extend({ lineNumber: z.number().int().min(1) })
  .superRefine((input, context) => {
    refinePartBuiltIsNotLinear(input, context);
    refinePartStandardPurchaseLength(
      {
        standardPurchaseLengthMm: input.standardPurchaseLengthMm ?? null,
        unitOfMeasure: input.unitOfMeasure,
      },
      context,
    );

    // The same rule as `refinePartSupplier`, against the Supplier *name* a CSV row carries.
    if (input.isInternallyFabricated && input.supplierName !== null) {
      context.addIssue({ code: 'custom', message: PART_BUILT_HAS_NO_SUPPLIER_MESSAGE, path: ['supplierName'] });
    }

    if (!input.isInternallyFabricated && input.supplierName === null) {
      context.addIssue({ code: 'custom', message: 'Supplier is required', path: ['supplierName'] });
    }
  });

export type PartBulkImportInput = z.infer<typeof PartBulkImportInput>;
export const PartBulkImportInput = z.object({
  rows: z.array(PartBulkImportRow).min(1, 'At least one part row is required'),
  supplierId: UUID.optional(),
});

export type PartBulkExportInput = z.infer<typeof PartBulkExportInput>;
export const PartBulkExportInput = z.object({
  /** Narrows the export to one Supplier's Parts, the same scoping the import accepts. */
  supplierId: UUID.optional(),
});

export type PartBulkImportResult = z.infer<typeof PartBulkImportResult>;
export const PartBulkImportResult = z.object({
  errors: z.array(z.string()),
  importedCount: z.number().int().min(0),
  updatedCount: z.number().int().min(0),
});

export type PartListInput = z.infer<typeof PartListInput>;
export const PartListInput = createSearchedSortedCursorQueryInput({
  shape: {
    category: z.string().trim().optional(),
    columnFilters: PartColumnFilters,
    supplierId: UUID.optional(),
  },
  sortBy: PartSortBy.default('name'),
});

export type PartListResult = z.infer<typeof PartListResult>;
export const PartListResult = createCursorQueryResult(Part);

export type PartCategoryListResult = z.infer<typeof PartCategoryListResult>;
export const PartCategoryListResult = z.object({
  categories: z.array(PartCategory),
});

export type PartStorageLocationListResult = z.infer<typeof PartStorageLocationListResult>;
export const PartStorageLocationListResult = z.object({
  locations: z.array(PartStorageLocation.unwrap()),
});

export type PartLabelPdfModel = z.infer<typeof PartLabelPdfModel>;
export const PartLabelPdfModel = Part.pick({ code: true, name: true, storageLocation: true });

export type PartLabelSelectionMode = z.infer<typeof PartLabelSelectionMode>;
export const PartLabelSelectionMode = z.enum(['all', 'category', 'storageLocation', 'ids']);

export type PartLabelBatchSelection = z.infer<typeof PartLabelBatchSelection>;
export const PartLabelBatchSelection = z.discriminatedUnion('selection', [
  z.object({ selection: z.literal(PartLabelSelectionMode.enum.all) }).strict(),
  z.object({ category: PartCategory, selection: z.literal(PartLabelSelectionMode.enum.category) }).strict(),
  z
    .object({
      selection: z.literal(PartLabelSelectionMode.enum.storageLocation),
      storageLocation: PartStorageLocation.unwrap(),
    })
    .strict(),
  z.object({ ids: z.array(UUID).min(1), selection: z.literal(PartLabelSelectionMode.enum.ids) }).strict(),
]);

/**
 * The batch selection as it arrives on a query string: every mode's field is flat and optional, and
 * `ids` is comma-separated. Narrowing to the union belongs here, not in the route.
 */
export type PartLabelBatchQuery = z.infer<typeof PartLabelBatchQuery>;
export const PartLabelBatchQuery = z
  .object({
    category: PartCategory.optional(),
    ids: z.string().optional(),
    selection: PartLabelSelectionMode,
    storageLocation: PartStorageLocation.unwrap().optional(),
  })
  .transform((query) => ({
    ...(query.selection === 'category' ? { category: query.category } : {}),
    ...(query.selection === 'storageLocation' ? { storageLocation: query.storageLocation } : {}),
    ...(query.selection === 'ids' ? { ids: query.ids?.split(',').filter(Boolean) } : {}),
    selection: query.selection,
  }))
  .pipe(PartLabelBatchSelection);

export type PartLabelPdfRenderer = (input: { document: PartLabelPdfModel[]; filename: string }) => Promise<Uint8Array>;
