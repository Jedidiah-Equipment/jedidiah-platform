import type { StockMovementWarningCode } from '@pkg/schema';

export type BuildBomLine = {
  componentPartId: string;
  quantity: number;
};

export type BuildConsumedLine = {
  quantity: number;
  /** Null where the component has no ledger cost yet — a trivial build consumes no value. */
  unitCost: number | null;
};

/**
 * What a build of N should take off the rack. The screen prefills from this and the builder edits it
 * to what actually left (spec §6), so this is a starting point, never the posted quantity.
 */
export function deriveBuildConsumption({
  bomLines,
  quantity,
}: {
  bomLines: readonly BuildBomLine[];
  quantity: number;
}): BuildBomLine[] {
  return bomLines.map((line) => ({ componentPartId: line.componentPartId, quantity: line.quantity * quantity }));
}

/**
 * Both build warnings, judged once so the dialog's prompt and the post agree. Neither blocks: a
 * deviation from the BOM is the record of what the rack actually gave, and a short rack goes
 * negative rather than refusing the build that already happened.
 */
export function deriveBuildWarnings({
  expectedQuantity,
  quantity,
  quantityOnHand,
}: {
  /** The BOM quantity times the build size — what the consumption prefilled to. */
  expectedQuantity: number;
  /** What the builder says actually left the rack. */
  quantity: number;
  quantityOnHand: number;
}): StockMovementWarningCode[] {
  const warnings: StockMovementWarningCode[] = [];

  if (quantity !== expectedQuantity) warnings.push('bom-deviation');
  if (quantityOnHand - quantity < 0) warnings.push('negative-stock-on-hand');

  return warnings;
}

/**
 * A build is value-preserving (spec §6): the value the consume rows take out of stock is exactly the
 * value the single produce row puts back, divided across the units produced.
 *
 * Null — not zero — when nothing consumed carries a cost. That is the trivial build, whose BOM is
 * raw material only, and spec §5 says a never-costed Part reads "no cost yet" rather than R0.00.
 */
export function deriveBuildProducedUnitCost({
  consumed,
  quantity,
}: {
  consumed: readonly BuildConsumedLine[];
  quantity: number;
}): number | null {
  if (!consumed.some((line) => line.unitCost !== null)) return null;

  return consumed.reduce((total, line) => total + line.quantity * (line.unitCost ?? 0), 0) / quantity;
}
