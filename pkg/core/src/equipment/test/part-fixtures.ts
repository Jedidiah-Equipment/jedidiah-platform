import type { parts } from '@pkg/db/equipment';

/** The columns every seeded Part needs, with the Supplier XOR BOM invariant already satisfied. */
export function partValues({
  code,
  isInternallyFabricated = false,
  standardPurchaseLengthMm = null,
  stockTrackingMode = 'perpetual',
  supplierId,
  unitOfMeasure,
}: {
  code: string;
  isInternallyFabricated?: boolean;
  standardPurchaseLengthMm?: number | null;
  stockTrackingMode?: 'periodic' | 'perpetual';
  supplierId: string;
  unitOfMeasure: 'kg' | 'mm' | 'piece';
}): typeof parts.$inferInsert {
  return {
    category: 'Test',
    code,
    description: `${code} description`,
    finish: 'None',
    isInternallyFabricated,
    name: code,
    standardPurchaseLengthMm,
    stockTrackingMode,
    supplierCode: code,
    // Supplier XOR BOM: a built Part is made in-house and bought from nobody.
    supplierId: isInternallyFabricated ? null : supplierId,
    unitOfMeasure,
  };
}
