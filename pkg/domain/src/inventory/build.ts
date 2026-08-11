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

/** One component of the Built Part's stored BOM, as the deviation check reads it. */
export type BuildBomComponent = BuildBomLine & {
  /**
   * Raw material. Its consumption is corrected by the next stocktake rather than posted (spec §6),
   * so its line writes no movement, and leaving it off the build is not a deviation.
   */
  isInformational: boolean;
};

/**
 * One component the builder says actually left the rack, with the facts its warnings are judged
 * against. Deliberately carries no cost: a price-blind reader previews the same warnings as anyone
 * else, so the judgement cannot depend on a figure their payload nulls out.
 */
export type BuildWarningLine = {
  componentPartId: string;
  isInformational: boolean;
  quantity: number;
  /** Stock on hand for this component's own length bucket, before the build. */
  quantityOnHand: number;
};

/** A posted line, which the ledger also needs a length and a cost for. */
export type BuildPostedLine = BuildWarningLine & {
  lengthMm: number | null;
  /** The component's current average, already scaled to the piece length; null when never costed. */
  unitCost: number | null;
};

export type BuildConsumptionRow = {
  componentPartId: string;
  lengthMm: number | null;
  quantity: number;
  unitCost: number | null;
};

export type BuildDerivation = {
  /** The consume rows to post, in the order they were keyed. An informational line never appears. */
  consumption: BuildConsumptionRow[];
  /** The value the consume rows removed, divided across the units made; null when none carried cost. */
  producedUnitCost: number | null;
  warnings: Array<{ codes: StockMovementWarningCode[]; componentPartId: string }>;
};

/**
 * The whole judgement of one build, as a pure function of what the builder keyed and what the ledger
 * held when the build took its locks. Both halves of the value-preserving rule (spec §6) are decided
 * here, so the rows a build writes can be derived once and inserted in one statement.
 *
 * Nothing here blocks. A deviation from the BOM is the record of what the rack actually gave, and a
 * short rack goes negative rather than refusing a build that has already happened.
 */
export function deriveBuild({
  bom,
  posted,
  quantity,
}: {
  bom: readonly BuildBomComponent[];
  posted: readonly BuildPostedLine[];
  quantity: number;
}): BuildDerivation {
  const consumption: BuildConsumptionRow[] = posted.flatMap((line) =>
    line.isInformational
      ? []
      : [
          {
            componentPartId: line.componentPartId,
            lengthMm: line.lengthMm,
            quantity: line.quantity,
            unitCost: line.unitCost,
          },
        ],
  );

  return {
    consumption,
    producedUnitCost: deriveBuildProducedUnitCost({ consumed: consumption, quantity }),
    warnings: deriveBuildComponentWarnings({ bom, lines: posted, quantity }),
  };
}

/**
 * Every component's warnings, attributed to the component that earned them. Split out of
 * `deriveBuild` so a preview can reach it: the whole build derivation also stamps costs, which a
 * price-blind builder never receives, and the dropped-line rule below used to be reachable only
 * through it — so the browser judged a build by a rule the post did not use.
 */
export function deriveBuildComponentWarnings({
  bom,
  lines,
  quantity,
}: {
  bom: readonly BuildBomComponent[];
  lines: readonly BuildWarningLine[];
  quantity: number;
}): BuildDerivation['warnings'] {
  const expectedByComponent = new Map(bom.map((line) => [line.componentPartId, line.quantity * quantity]));
  const warnings: BuildDerivation['warnings'] = [];

  for (const line of lines) {
    const codes = deriveBuildWarnings({
      // A component the BOM never asked for is expected at zero, so posting any of it deviates.
      expectedQuantity: expectedByComponent.get(line.componentPartId) ?? 0,
      isInformational: line.isInformational,
      quantity: line.quantity,
      quantityOnHand: line.quantityOnHand,
    });
    if (codes.length > 0) warnings.push({ codes, componentPartId: line.componentPartId });
  }

  // A BOM component the builder left off the list entirely consumed none of what the BOM asked for,
  // which is as much a deviation as an edited quantity — and the loop above never sees it.
  const keyedComponentIds = new Set(lines.map((line) => line.componentPartId));
  for (const line of bom) {
    if (line.isInformational || keyedComponentIds.has(line.componentPartId)) continue;
    warnings.push({ codes: ['bom-deviation'], componentPartId: line.componentPartId });
  }

  return warnings;
}

/**
 * Both per-component warnings, judged once so the dialog's prompt and the post agree. Neither
 * blocks: a deviation from the BOM is the record of what the rack actually gave, and a short rack
 * goes negative rather than refusing the build that already happened.
 */
export function deriveBuildWarnings({
  expectedQuantity,
  isInformational = false,
  quantity,
  quantityOnHand,
}: {
  /** The BOM quantity times the build size — what the consumption prefilled to. */
  expectedQuantity: number;
  /** Raw material, whose line posts nothing. Its deviation still reads; its stock figure does not. */
  isInformational?: boolean;
  /** What the builder says actually left the rack. */
  quantity: number;
  quantityOnHand: number;
}): StockMovementWarningCode[] {
  const warnings: StockMovementWarningCode[] = [];

  if (quantity !== expectedQuantity) warnings.push('bom-deviation');
  // Periodic stock is only truly counted at stocktake, so "the rack is short" is not a fact a build
  // is in a position to assert about it — but what the builder says they took still is.
  if (!isInformational && quantityOnHand - quantity < 0) warnings.push('negative-stock-on-hand');

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
