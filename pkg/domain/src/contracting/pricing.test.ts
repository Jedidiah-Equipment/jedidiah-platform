import { describe, expect, test } from 'vitest';
import { canMarkPriced, computeDieselAmount, computeJobTotals, priceStint, pricingGateReasons } from './pricing.js';

const loads = 'loads-measure-type';
const time = (billableHours: number, unitAmount: number) =>
  priceStint({ basis: 'time', unitAmount, measureTypeId: null, billableHours, measures: [] });

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

  test('totals R 77,265.00 ex VAT with the low-bed charge line and diesel', () => {
    const dieselAmount = computeDieselAmount(210, 23);
    expect(dieselAmount).toBe(4_830);
    expect(
      computeJobTotals({
        stintFinalAmounts: stints.map((stint) => stint.computedAmount),
        chargeLineAmounts: [3_500],
        discount: null,
        dieselAmount,
      }),
    ).toEqual({
      stintsTotal: 68_935,
      chargeLinesTotal: 3_500,
      subtotal: 72_435,
      discountAmount: 0,
      dieselAmount: 4_830,
      total: 77_265,
    });
  });

  test('takes a 5 % discount off stints and charge lines, never diesel', () => {
    expect(
      computeJobTotals({
        stintFinalAmounts: stints.map((stint) => stint.computedAmount),
        chargeLineAmounts: [3_500],
        discount: { kind: 'percent', value: 5 },
        dieselAmount: 4_830,
      }),
    ).toMatchObject({ subtotal: 72_435, discountAmount: 3_621.75, dieselAmount: 4_830, total: 73_643.25 });
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

describe('computeJobTotals', () => {
  test('caps a fixed discount at its base', () => {
    expect(
      computeJobTotals({
        stintFinalAmounts: [1_000],
        chargeLineAmounts: [200],
        discount: { kind: 'amount', value: 5_000 },
        dieselAmount: 300,
      }),
    ).toMatchObject({ subtotal: 1_200, discountAmount: 1_200, total: 300 });
  });
});

describe('canMarkPriced', () => {
  test('lists every reason the job cannot be priced yet', () => {
    const gate = canMarkPriced({
      dieselLitres: 210,
      dieselAmount: null,
      stints: [{ priced: true }, { priced: false }, { priced: false }],
      chargeLines: [{ amount: 0 }, { amount: null }],
    });
    expect(gate).toEqual({ ok: false, unpricedStints: 2, chargeLinesWithoutAmount: 1, dieselUnpriced: true });
    expect(pricingGateReasons(gate)).toEqual([
      '2 stints have no Rate',
      '1 charge line has no amount',
      'Diesel is not priced',
    ]);
  });

  test('passes with zero amounts and no diesel', () => {
    expect(
      canMarkPriced({ dieselLitres: 0, dieselAmount: null, stints: [{ priced: true }], chargeLines: [{ amount: 0 }] }),
    ).toEqual({ ok: true, unpricedStints: 0, chargeLinesWithoutAmount: 0, dieselUnpriced: false });
  });
});
