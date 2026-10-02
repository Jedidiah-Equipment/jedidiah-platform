import type { AssignmentState, JobStatus } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import {
  type JobPricingFacts,
  type PricedJob,
  priceJob,
  priceStint,
  pricingGateReasons,
  rateUnitLabel,
  type StoredStintPricing,
  stintAmount,
} from './pricing.js';

const loads = 'loads-measure-type';
const time = (billableHours: number, unitAmount: number) =>
  priceStint({ basis: 'time', unitAmount, measureTypeId: null, billableHours, measures: [] });

type Stint = JobPricingFacts['stints'][number];

type StoredAmounts = Partial<Record<'amountOverride' | 'computedAmount' | 'finalAmount', number | null>>;

const timeRate = (unitAmount: number, amounts: StoredAmounts = {}): StoredStintPricing => ({
  kind: 'rate',
  rateId: 'dry-hire',
  name: 'Dry hire',
  basis: 'time',
  measureTypeId: null,
  measureTypeName: null,
  unitAmount,
  amountOverride: null,
  computedAmount: null,
  finalAmount: null,
  ...amounts,
});

const rated = (
  billableHours: number,
  unitAmount: number,
  stored: StoredStintPricing = timeRate(unitAmount),
): Stint => ({
  state: 'left',
  billableHours,
  measures: [],
  stored,
});

const unpriced = (state: AssignmentState = 'left'): Stint => ({ state, billableHours: 10, measures: [], stored: null });

const loadsStint: Stint = {
  state: 'left',
  billableHours: 30,
  measures: [{ measureTypeId: loads, quantity: 18 }],
  stored: {
    kind: 'rate',
    rateId: 'tanker',
    name: 'Tractor and tanker',
    basis: 'measure',
    measureTypeId: loads,
    measureTypeName: 'Loads',
    unitAmount: 850,
    amountOverride: null,
    computedAmount: null,
    finalAmount: null,
  },
};

const facts = (overrides: Partial<JobPricingFacts> = {}): JobPricingFacts => ({
  status: 'completed',
  stints: [],
  chargeLines: [],
  diesel: { litres: 0, unitPrice: null, amountOverride: null, amount: null },
  discount: null,
  ...overrides,
});

const rateOf = (priced: PricedJob, index: number) => {
  const pricing = priced.stints[index];
  if (pricing?.kind !== 'rate') throw new Error('Expected a rated stint.');
  return pricing;
};

describe('spec #1378 scenario 1', () => {
  const stints = [
    time(48.6, 600),
    time(44.5, 550),
    priceStint({
      basis: 'measure',
      unitAmount: 850,
      measureTypeId: loads,
      billableHours: 30,
      measures: [{ measureTypeId: loads, quantity: 18 }],
    }),
  ];

  test('prices each stint from its Rate basis', () => {
    expect(stints.map((stint) => stint.computedAmount)).toEqual([29_160, 24_475, 15_300]);
    expect(stints[2]).toMatchObject({ quantity: 18, measureMissing: false });
  });
});

describe('priceStint', () => {
  test('bills a measure Rate with no matching Measure at zero and says so', () => {
    expect(
      priceStint({
        basis: 'measure',
        unitAmount: 850,
        measureTypeId: loads,
        billableHours: 10,
        measures: [{ measureTypeId: 'hectares', quantity: 4 }],
      }),
    ).toEqual({ quantity: 0, computedAmount: 0, measureMissing: true });
  });

  test('bills No charge at zero', () => {
    expect(priceStint({ basis: null, unitAmount: 0, measureTypeId: null, billableHours: 10, measures: [] })).toEqual({
      quantity: 0,
      computedAmount: 0,
      measureMissing: false,
    });
  });
});

describe('priceJob', () => {
  const scenario = facts({
    stints: [rated(48.6, 600), rated(44.5, 550), loadsStint],
    chargeLines: [{ amount: 3_500 }],
    diesel: { litres: 210, unitPrice: 23, amountOverride: null, amount: null },
  });

  test('totals R 77,265.00 ex VAT with the low-bed charge line and diesel', () => {
    const priced = priceJob(scenario);
    expect(priced.pricing).toEqual({
      stintsTotal: 68_935,
      chargeLinesTotal: 3_500,
      subtotal: 72_435,
      discountAmount: 0,
      dieselAmount: 4_830,
      total: 77_265,
      gate: { ok: true, unpricedStints: 0, chargeLinesWithoutAmount: 0, dieselUnpriced: false },
    });
    expect(priced.diesel).toEqual({ unitPrice: 23, amount: 4_830, amountEdited: false });
    expect(priced.discount).toBeNull();
  });

  test('takes a 5 % discount off stints and charge lines, never diesel', () => {
    const priced = priceJob({ ...scenario, discount: { kind: 'percent', value: 5, amount: null } });
    expect(priced.pricing).toMatchObject({ discountAmount: 3_621.75, total: 73_643.25 });
    expect(priced.discount).toEqual({ kind: 'percent', value: 5, amount: 3_621.75 });
  });

  test('caps a fixed discount at its base', () => {
    const priced = priceJob(
      facts({
        stints: [rated(10, 100)],
        chargeLines: [{ amount: 200 }],
        discount: { kind: 'amount', value: 5_000, amount: null },
        diesel: { litres: 10, unitPrice: 30, amountOverride: null, amount: null },
      }),
    );
    expect(priced.pricing).toMatchObject({ subtotal: 1_200, discountAmount: 1_200, total: 300 });
  });

  const moved = [rated(12, 600), rated(12, 600, timeRate(600, { amountOverride: 5_500 }))];

  const expectDerived = (priced: PricedJob) => {
    expect(rateOf(priced, 0)).toMatchObject({
      computedAmount: 7_200,
      finalAmount: 7_200,
      amountEdited: false,
      billedQuantity: 12,
    });
    expect(rateOf(priced, 1)).toMatchObject({ computedAmount: 7_200, finalAmount: 5_500, amountEdited: true });
  };

  test('derives a Completed Job from its live hours and keeps an override', () => {
    expectDerived(priceJob(facts({ stints: moved })));
  });

  test.each<JobStatus>(['priced', 'invoiced'])('reads the stored snapshot once %s', (status) => {
    const frozen = [
      rated(12, 600, timeRate(600, { computedAmount: 6_000, finalAmount: 6_000 })),
      rated(12, 600, timeRate(600, { amountOverride: 5_500, computedAmount: 6_000, finalAmount: 5_500 })),
    ];
    const priced = priceJob(facts({ status, stints: frozen }));
    expect(rateOf(priced, 0)).toMatchObject({ computedAmount: 6_000, finalAmount: 6_000, billedQuantity: 12 });
    expect(rateOf(priced, 1)).toMatchObject({ computedAmount: 6_000, finalAmount: 5_500, amountEdited: true });
  });

  test.each<JobStatus>(['cancelled', 'active'])('derives amounts in every status that is not frozen: %s', (status) => {
    expectDerived(priceJob(facts({ status, stints: moved })));
  });

  test('an override stays edited when it equals the computed amount', () => {
    const priced = priceJob(
      facts({
        stints: [rated(12, 600, timeRate(600, { amountOverride: 7_200 }))],
        diesel: { litres: 210, unitPrice: 23, amountOverride: 4_830, amount: null },
      }),
    );
    expect(rateOf(priced, 0)).toMatchObject({ finalAmount: 7_200, amountEdited: true });
    expect(priced.diesel).toEqual({ unitPrice: 23, amount: 4_830, amountEdited: true });
  });

  test('refuses a Priced stint that stores no amounts', () => {
    expect(() => priceJob(facts({ status: 'priced', stints: [rated(12, 600)] }))).toThrow(
      'A Priced Machine Assignment always stores its amounts.',
    );
  });

  test('bills No charge at nothing and counts it as priced', () => {
    const priced = priceJob(facts({ stints: [{ ...unpriced(), stored: { kind: 'no-charge' } }] }));
    expect(priced.stints).toEqual([{ kind: 'no-charge' }]);
    expect(priced.pricing).toMatchObject({ stintsTotal: 0, gate: { unpricedStints: 0 } });
  });

  test('flags a measure Rate with no matching Measure and bills it at zero', () => {
    const priced = priceJob(facts({ stints: [{ ...loadsStint, measures: [] }] }));
    expect(rateOf(priced, 0)).toMatchObject({ measureMissing: true, billedQuantity: 0, computedAmount: 0 });
  });

  test('counts Diesel only when litres were supplied', () => {
    const none = priceJob(facts({ diesel: { litres: 0, unitPrice: 23, amountOverride: null, amount: null } }));
    expect(none.pricing).toMatchObject({ dieselAmount: 0, gate: { dieselUnpriced: false } });
    const unpricedDiesel = priceJob(
      facts({ diesel: { litres: 210, unitPrice: null, amountOverride: null, amount: null } }),
    );
    expect(unpricedDiesel.pricing).toMatchObject({ dieselAmount: 0, gate: { dieselUnpriced: true } });
    expect(unpricedDiesel.diesel).toBeNull();
  });

  test('marks an overridden Diesel amount as edited', () => {
    const priced = priceJob(facts({ diesel: { litres: 210, unitPrice: 23, amountOverride: 4_800, amount: null } }));
    expect(priced.diesel).toEqual({ unitPrice: 23, amount: 4_800, amountEdited: true });
  });

  test('lists every reason the job cannot be priced yet', () => {
    const { gate } = priceJob(
      facts({
        stints: [rated(10, 600), unpriced(), unpriced()],
        chargeLines: [{ amount: 0 }, { amount: null }],
        diesel: { litres: 210, unitPrice: null, amountOverride: null, amount: null },
      }),
    ).pricing;
    expect(gate).toEqual({ ok: false, unpricedStints: 2, chargeLinesWithoutAmount: 1, dieselUnpriced: true });
    expect(pricingGateReasons(gate)).toEqual([
      '2 Assignments have no Rate',
      '1 charge line has no amount',
      'Diesel is not priced',
    ]);
  });

  test('passes the gate with zero amounts and no diesel', () => {
    const { gate } = priceJob(facts({ stints: [rated(0, 600)], chargeLines: [{ amount: 0 }] })).pricing;
    expect(gate).toEqual({ ok: true, unpricedStints: 0, chargeLinesWithoutAmount: 0, dieselUnpriced: false });
  });

  test('prices and totals only stints that have left', () => {
    const priced = priceJob(facts({ stints: [unpriced('on-site'), unpriced('planned'), rated(10, 600)] }));
    expect(priced.pricing).toMatchObject({ stintsTotal: 6_000, gate: { unpricedStints: 0 } });
  });

  test('keeps the stored discount amount once Priced', () => {
    const discount = { kind: 'amount', value: 500, amount: 400 } as const;
    const stints = [rated(10, 600, timeRate(600, { computedAmount: 6_000, finalAmount: 6_000 }))];
    expect(priceJob(facts({ status: 'priced', stints, discount })).discount).toEqual(discount);
    const live = priceJob(facts({ stints, discount }));
    expect(live.discount?.amount).toBe(live.pricing.discountAmount);
  });

  test("stintAmount reads a rate's final amount and nothing else", () => {
    const rate = rateOf(priceJob(facts({ stints: [rated(10, 600, timeRate(600, { amountOverride: 5_500 }))] })), 0);
    expect(stintAmount(rate)).toBe(5_500);
    expect(stintAmount({ kind: 'no-charge' })).toBe(0);
    expect(stintAmount(null)).toBe(0);
  });
});

describe('rateUnitLabel', () => {
  test("names a Rate's unit", () => {
    expect(rateUnitLabel('time', null)).toBe('h');
    expect(rateUnitLabel('measure', 'Loads')).toBe('Loads');
    expect(rateUnitLabel('measure', null)).toBe('unit');
  });
});
