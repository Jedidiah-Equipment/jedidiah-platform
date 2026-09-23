import type { DiscountKind, RateBasis } from '@pkg/schema/contracting';
import { formatNumber } from '../formatting/number.js';

export const round2 = (value: number) => Math.round(value * 100) / 100;

export type StintPricingFacts = {
  /** null is No charge. */
  basis: RateBasis | null;
  unitAmount: number;
  measureTypeId: string | null;
  billableHours: number | null;
  measures: readonly { measureTypeId: string; quantity: number }[];
};

export type StintPrice = { quantity: number; computedAmount: number; measureMissing: boolean };

/** What a Rate bills on this stint. A measure Rate with no matching Measure bills 0 and says so. */
export function priceStint(facts: StintPricingFacts): StintPrice {
  if (facts.basis === null) return { quantity: 0, computedAmount: 0, measureMissing: false };
  if (facts.basis === 'time') {
    const quantity = facts.billableHours ?? 0;
    return { quantity, computedAmount: round2(quantity * facts.unitAmount), measureMissing: false };
  }
  const measure = facts.measures.find((item) => item.measureTypeId === facts.measureTypeId);
  const quantity = measure?.quantity ?? 0;
  return { quantity, computedAmount: round2(quantity * facts.unitAmount), measureMissing: !measure };
}

export const computeDieselAmount = (litres: number, unitPrice: number) => round2(litres * unitPrice);

export type JobDiscount = { kind: DiscountKind; value: number };

export type JobTotals = {
  stintsTotal: number;
  chargeLinesTotal: number;
  subtotal: number;
  discountAmount: number;
  dieselAmount: number;
  total: number;
};

/** A percentage of the base, or a fixed amount that cannot exceed it. */
export function computeDiscountAmount(base: number, discount: JobDiscount | null) {
  if (!discount) return 0;
  return discount.kind === 'percent' ? round2((base * discount.value) / 100) : Math.min(round2(discount.value), base);
}

const sum = (values: readonly number[]) => round2(values.reduce((total, value) => total + value, 0));

/** The Discount base is stints + Charge Lines, never Diesel; a fixed Discount cannot exceed its base. */
export function computeJobTotals(input: {
  stintFinalAmounts: readonly number[];
  chargeLineAmounts: readonly number[];
  discount: JobDiscount | null;
  dieselAmount: number;
}): JobTotals {
  const stintsTotal = sum(input.stintFinalAmounts);
  const chargeLinesTotal = sum(input.chargeLineAmounts);
  const subtotal = round2(stintsTotal + chargeLinesTotal);
  const discountAmount = computeDiscountAmount(subtotal, input.discount);
  return {
    stintsTotal,
    chargeLinesTotal,
    subtotal,
    discountAmount,
    dieselAmount: input.dieselAmount,
    total: round2(subtotal - discountAmount + input.dieselAmount),
  };
}

export type PricingGate = {
  ok: boolean;
  unpricedStints: number;
  chargeLinesWithoutAmount: number;
  dieselUnpriced: boolean;
};

/** Every stint has a Rate or No charge, every Charge Line an amount (zero allowed), and supplied Diesel a price. */
export function canMarkPriced(job: {
  dieselLitres: number;
  dieselAmount: number | null;
  stints: readonly { priced: boolean }[];
  chargeLines: readonly { amount: number | null }[];
}): PricingGate {
  const unpricedStints = job.stints.filter((stint) => !stint.priced).length;
  const chargeLinesWithoutAmount = job.chargeLines.filter((line) => line.amount === null).length;
  const dieselUnpriced = job.dieselLitres > 0 && job.dieselAmount === null;
  return {
    ok: unpricedStints === 0 && chargeLinesWithoutAmount === 0 && !dieselUnpriced,
    unpricedStints,
    chargeLinesWithoutAmount,
    dieselUnpriced,
  };
}

const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

/** Why a Job cannot be marked as Priced yet, one phrase per unmet condition. */
export function pricingGateReasons(gate: PricingGate): string[] {
  return [
    ...(gate.unpricedStints ? [`${plural(gate.unpricedStints, 'Assignment has', 'Assignments have')} no Rate`] : []),
    ...(gate.chargeLinesWithoutAmount
      ? [`${plural(gate.chargeLinesWithoutAmount, 'charge line has', 'charge lines have')} no amount`]
      : []),
    ...(gate.dieselUnpriced ? ['Diesel is not priced'] : []),
  ];
}
