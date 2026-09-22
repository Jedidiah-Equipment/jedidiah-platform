import type { Db } from '@pkg/db';
import { partCategories, type parts } from '@pkg/db/equipment';

/** Every Part belongs to one Part Category, so a suite seeds one before its Parts. */
export async function seedPartCategory(db: Db, name = 'General'): Promise<string> {
  const [row] = await db.insert(partCategories).values({ name }).returning({ id: partCategories.id });
  if (!row) throw new Error('Part Category insert did not return a row');

  return row.id;
}

/** The columns every seeded Part needs, with the Supplier XOR BOM invariant already satisfied. */
export function partValues({
  averageUtilizationPercent = null,
  categoryId,
  code,
  isInternallyFabricated = false,
  standardPurchaseLengthMm = null,
  stockTrackingMode = 'perpetual',
  supplierId,
  unitOfMeasure,
}: {
  /** A plate: needs `stockTrackingMode: 'periodic'` and a discrete unit, per the eligibility check. */
  averageUtilizationPercent?: number | null;
  categoryId: string;
  code: string;
  isInternallyFabricated?: boolean;
  standardPurchaseLengthMm?: number | null;
  stockTrackingMode?: 'periodic' | 'perpetual';
  supplierId: string;
  unitOfMeasure: 'kg' | 'mm' | 'piece';
}): typeof parts.$inferInsert {
  return {
    averageUtilizationPercent,
    categoryId,
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
