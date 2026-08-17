import { formatCurrency, formatNumber } from '@pkg/domain';
import { PART_UNIT_OF_MEASURE_LABELS, type PartUnitOfMeasure } from '@pkg/schema';

export type PartQuantityUnitDisplay = {
  label: string;
  suffix: string;
};

/** A Part read for what it is bought and costed by the piece as. */
export type PartPurchaseUnit = {
  standardPurchaseLengthMm: number | null;
  unitOfMeasure: PartUnitOfMeasure;
};

/** What the ledger's `numeric(18, 6)` unit cost can hold, which is what a per-millimetre average needs. */
const LEDGER_COST_DECIMALS = 6;

const UNIT_SUFFIXES = {
  box: 'box',
  kg: 'kg',
  litre: 'L',
  mm: 'mm',
  pair: 'pair',
  piece: 'pc',
  set: 'set',
} as const satisfies Record<PartUnitOfMeasure, string>;

const MAX_QUANTITY_DECIMALS = 3;

export function getPartQuantityUnitDisplay(unitOfMeasure: PartUnitOfMeasure | undefined): PartQuantityUnitDisplay {
  const unit = unitOfMeasure ?? 'piece';

  return { label: PART_UNIT_OF_MEASURE_LABELS[unit], suffix: UNIT_SUFFIXES[unit] };
}

/**
 * A linear Part's quantity is a count of pieces, never a length (spec §2) — `mm` marks the class the
 * bucket length is measured in. Callers holding a linear quantity use this rather than the suffix.
 */
export function formatPartQuantity(quantity: number, unitOfMeasure: PartUnitOfMeasure): string {
  if (unitOfMeasure === 'mm') {
    return `${formatQuantityValue(quantity)} pieces`;
  }

  return `${quantity} ${UNIT_SUFFIXES[unitOfMeasure]}`;
}

/**
 * How a Part is *ordered*, for the surfaces that raise and read Purchase Order lines: a linear Part
 * is bought as whole pieces of its standard length, never as millimetres (spec §2). Shared so a
 * seeded line and the draft it opens in cannot label the same quantity two different ways.
 */
export function formatPurchaseUnitLabel(part: PartPurchaseUnit): string {
  const pieceLengthMm = purchasePieceLengthMm(part);

  return pieceLengthMm === null ? PART_UNIT_OF_MEASURE_LABELS[part.unitOfMeasure] : `Pieces · ${pieceLengthMm} mm each`;
}

/**
 * What a costed line's unit cost is *per*, where that is not the quantity beside it. A linear Part's
 * average is held per millimetre but priced by the whole piece it is bought as, so the figure is the
 * standard length's worth rather than the millimetre's — unqualified it reads as a thousandfold error.
 * Null where the counting unit already says it, which is every other Part.
 */
export function formatUnitCostBasis(part: PartPurchaseUnit): string | null {
  const pieceLengthMm = purchasePieceLengthMm(part);

  return pieceLengthMm === null ? null : `per ${pieceLengthMm} mm piece`;
}

/** The length of the piece a Part is bought and costed as, or null where it is not bought by length. */
function purchasePieceLengthMm({ standardPurchaseLengthMm, unitOfMeasure }: PartPurchaseUnit): number | null {
  return unitOfMeasure === 'mm' ? standardPurchaseLengthMm : null;
}

/**
 * A Part's cost in the unit it is counted by. A linear Part's average is per millimetre and sub-cent by
 * design, so the usual two decimals would show R0.038/mm as R0.04/mm — and the per-piece figures derived
 * from it would no longer reconcile with the number on screen. Any unit keeps a cost two decimals would
 * round away, since R0.00 against stock that carries value reads as free rather than as cheap.
 */
export function formatUnitCost(value: number, unitOfMeasure: PartUnitOfMeasure): string {
  if (unitOfMeasure !== 'mm' && !roundsToNothing(value, 2)) return formatCurrency(value, 'ZAR', { decimals: 2 });

  // Finer than the ledger itself holds — a bound is the honest reading, where a row of zeros is not.
  if (roundsToNothing(value, LEDGER_COST_DECIMALS)) {
    return `< ${formatCurrency(10 ** -LEDGER_COST_DECIMALS, 'ZAR', { decimals: LEDGER_COST_DECIMALS })}`;
  }

  return formatCurrency(value, 'ZAR', { decimals: subCentDecimals(value) });
}

/** Whether a cost that is really there renders as nothing at `decimals`. Zero itself is not that claim. */
function roundsToNothing(value: number, decimals: number): boolean {
  return value > 0 && Number(value.toFixed(decimals)) === 0;
}

function subCentDecimals(value: number): number {
  const fraction = value.toFixed(LEDGER_COST_DECIMALS).replace(/0+$/, '').split('.')[1] ?? '';

  return Math.max(2, fraction.length);
}

/** Metres are display formatting of `mm`, never a second unit (spec §2). */
export function formatLengthMetres(lengthMm: number): string {
  return `${formatNumber(lengthMm / 1_000, { decimals: lengthMm % 1_000 === 0 ? 0 : 1 })} m`;
}

/** One length bucket of linear stock, read as "6 m x 3". */
export function formatLengthBucket(lengthMm: number, quantity: number): string {
  return `${formatLengthMetres(lengthMm)} × ${formatQuantityValue(quantity)}`;
}

function formatQuantityValue(quantity: number): string {
  const roundedQuantity = Math.round(quantity * 10 ** MAX_QUANTITY_DECIMALS) / 10 ** MAX_QUANTITY_DECIMALS;
  const normalizedQuantity = Object.is(roundedQuantity, -0) ? 0 : roundedQuantity;
  const [coefficient = '', exponentText = '0'] = normalizedQuantity.toString().toLowerCase().split('e');
  const fractionLength = coefficient.split('.')[1]?.length ?? 0;
  const decimals = Math.min(MAX_QUANTITY_DECIMALS, Math.max(0, fractionLength - Number(exponentText)));

  return formatNumber(normalizedQuantity, { decimals });
}
