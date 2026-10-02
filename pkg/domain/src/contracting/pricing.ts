import type {
  AssignmentState,
  DiscountKind,
  JobDiesel,
  JobDiscount,
  JobPricing,
  JobStatus,
  PricingGate,
  RateBasis,
  StintPricing,
} from '@pkg/schema/contracting';
import { countPhrase } from './count-phrase.js';

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

/** A percentage of the base, or a fixed amount that cannot exceed it. */
export function computeDiscountAmount(base: number, discount: Pick<JobDiscount, 'kind' | 'value'> | null): number {
  if (!discount) return 0;
  return discount.kind === 'percent' ? round2((base * discount.value) / 100) : Math.min(round2(discount.value), base);
}

/** What a stint bills: a rate's final amount; No charge and un-priced bill nothing. */
export const stintAmount = (pricing: StintPricing | null): number =>
  pricing?.kind === 'rate' ? pricing.finalAmount : 0;

const sum = (values: readonly number[]) => round2(values.reduce((total, value) => total + value, 0));

/** A stint's stored Rate snapshot, any typed amount, and the amounts Mark as Priced froze. */
export type StoredStintPricing =
  | { kind: 'no-charge' }
  | {
      kind: 'rate';
      rateId: string;
      name: string;
      basis: RateBasis;
      measureTypeId: string | null;
      measureTypeName: string | null;
      unitAmount: number;
      /** A typed amount; null follows the computed one. */
      amountOverride: number | null;
      /** Null until Mark as Priced. */
      computedAmount: number | null;
      finalAmount: number | null;
    };

export type JobPricingFacts = {
  status: JobStatus;
  stints: readonly {
    state: AssignmentState;
    billableHours: number | null;
    measures: readonly { measureTypeId: string; quantity: number }[];
    /** Null is un-priced. */
    stored: StoredStintPricing | null;
  }[];
  chargeLines: readonly { amount: number | null }[];
  /** `amount` is the frozen figure, null until Mark as Priced. */
  diesel: { litres: number; unitPrice: number | null; amountOverride: number | null; amount: number | null };
  discount: { kind: DiscountKind; value: number; amount: number | null } | null;
};

export type PricedJob = {
  /** One entry per `facts.stints` entry, in the same order. */
  stints: (StintPricing | null)[];
  diesel: JobDiesel | null;
  discount: JobDiscount | null;
  pricing: JobPricing;
};

/**
 * The one pricing policy: what a Job's stored figures and live facts price to, for no one in particular.
 * Until Priced, amounts derive from live hours, Measures and any override; once Priced they are the frozen snapshot.
 */
export function priceJob(facts: JobPricingFacts): PricedJob {
  const frozen = facts.status === 'priced' || facts.status === 'invoiced';
  const stints = facts.stints.map((stint): StintPricing | null => {
    const { stored } = stint;
    if (stored === null) return null;
    if (stored.kind === 'no-charge') return { kind: 'no-charge' };
    const price = priceStint({
      basis: stored.basis,
      unitAmount: stored.unitAmount,
      measureTypeId: stored.measureTypeId,
      billableHours: stint.billableHours,
      measures: stint.measures,
    });
    const { computedAmount, finalAmount } = frozen
      ? stored
      : { computedAmount: price.computedAmount, finalAmount: stored.amountOverride ?? price.computedAmount };
    if (computedAmount === null || finalAmount === null)
      throw new Error('A Priced Machine Assignment always stores its amounts.');
    return {
      kind: 'rate',
      rateId: stored.rateId,
      name: stored.name,
      basis: stored.basis,
      measureTypeId: stored.measureTypeId,
      measureTypeName: stored.measureTypeName,
      unitAmount: stored.unitAmount,
      billedQuantity: price.quantity,
      measureMissing: price.measureMissing,
      computedAmount,
      finalAmount,
      amountEdited: stored.amountOverride !== null,
    };
  });
  const left = stints.filter((_, index) => facts.stints[index]?.state === 'left');

  const stintsTotal = sum(left.map(stintAmount));
  const chargeLinesTotal = sum(facts.chargeLines.map((line) => line.amount ?? 0));
  const subtotal = round2(stintsTotal + chargeLinesTotal);
  const discountAmount = computeDiscountAmount(subtotal, facts.discount);
  const { litres, unitPrice } = facts.diesel;
  const diesel = unitPrice === null ? null : pricedDiesel(facts.diesel, unitPrice, frozen);
  const dieselAmount = litres > 0 ? (diesel?.amount ?? 0) : 0;

  const unpricedStints = left.filter((pricing) => pricing === null).length;
  const chargeLinesWithoutAmount = facts.chargeLines.filter((line) => line.amount === null).length;
  const dieselUnpriced = litres > 0 && unitPrice === null;

  return {
    stints,
    diesel,
    discount: facts.discount && {
      kind: facts.discount.kind,
      value: facts.discount.value,
      amount: frozen ? (facts.discount.amount ?? discountAmount) : discountAmount,
    },
    pricing: {
      stintsTotal,
      chargeLinesTotal,
      subtotal,
      discountAmount,
      dieselAmount,
      total: round2(subtotal - discountAmount + dieselAmount),
      gate: {
        ok: unpricedStints === 0 && chargeLinesWithoutAmount === 0 && !dieselUnpriced,
        unpricedStints,
        chargeLinesWithoutAmount,
        dieselUnpriced,
      },
    },
  };
}

function pricedDiesel(facts: JobPricingFacts['diesel'], unitPrice: number, frozen: boolean): JobDiesel {
  const amount =
    frozen && facts.amount !== null
      ? facts.amount
      : (facts.amountOverride ?? computeDieselAmount(facts.litres, unitPrice));
  return { unitPrice, amount, amountEdited: facts.amountOverride !== null };
}

/** What one unit of a Rate is: an hour, or the Rate's Measure Type. */
export const rateUnitLabel = (basis: RateBasis, measureTypeName: string | null): string =>
  basis === 'time' ? 'h' : (measureTypeName ?? 'unit');

/** Why a Job cannot be marked as Priced yet, one phrase per unmet condition. */
export function pricingGateReasons(gate: PricingGate): string[] {
  return [
    ...(gate.unpricedStints
      ? [`${countPhrase(gate.unpricedStints, 'Assignment has', 'Assignments have')} no Rate`]
      : []),
    ...(gate.chargeLinesWithoutAmount
      ? [`${countPhrase(gate.chargeLinesWithoutAmount, 'charge line has', 'charge lines have')} no amount`]
      : []),
    ...(gate.dieselUnpriced ? ['Diesel is not priced'] : []),
  ];
}
