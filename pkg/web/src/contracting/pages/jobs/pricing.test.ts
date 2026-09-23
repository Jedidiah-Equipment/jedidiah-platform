import type { Assignment, ChargeLine, JobDetail, Rate } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { formulaLabel, NO_CHARGE, pricingRows, rateCardDrift, rateSelectOptions } from './pricing.js';

const priced = (id: string, machineId: string, capturedAt: string, finalAmount: number, overrides = {}) =>
  ({
    id,
    machineId,
    machineCode: machineId.toUpperCase(),
    createdAt: capturedAt,
    state: 'left',
    arrival: { capturedAt },
    workHours: 8,
    travelHours: 0,
    measures: [],
    rateId: 'dry',
    rateName: 'Dry hire',
    rateBasis: 'time',
    rateMeasureTypeId: null,
    rateUnitAmount: 600,
    computedAmount: finalAmount,
    finalAmount,
    billedQuantity: finalAmount / 600,
    ...overrides,
  }) as unknown as Assignment;

const rate = (id: string, name: string, amount: number, measureTypeName: string | null = null) =>
  ({ id, name, amount, basis: measureTypeName ? 'measure' : 'time', measureTypeName }) as unknown as Rate;

describe('pricingRows', () => {
  it('orders machine lines, subtotals repeat stints by final amount, then charge lines, diesel and discount', () => {
    const later = priced('a2', 'cat', '2026-09-03T08:00:00Z', 3_300);
    const first = priced('a1', 'cat', '2026-09-01T08:00:00Z', 6_000);
    const tipper = priced('b1', 'tip', '2026-09-02T08:00:00Z', 15_300);
    const line = { id: 'l1', description: 'Low-bed', amount: 3_500, displayOrder: 0 } as ChargeLine;
    const job = {
      assignments: [later, tipper, first],
      chargeLines: [line],
      dieselLitres: 210,
      dieselUnitPrice: 23,
      dieselAmount: 4_830,
      dieselAmountEdited: false,
      discountKind: null,
      discountValue: null,
      discountAmount: null,
    } as unknown as JobDetail;

    expect(pricingRows(job, { editable: false }).map((row) => row.kind)).toEqual([
      'stint',
      'stint',
      'subtotal',
      'stint',
      'charge-line',
      'diesel',
    ]);
    expect(pricingRows(job, { editable: false })[2]).toEqual({ kind: 'subtotal', machineCode: 'CAT', amount: 9_300 });
    expect(pricingRows(job, { editable: true }).at(-1)).toEqual({ kind: 'discount', discount: null, amount: null });
  });
});

describe('formulaLabel', () => {
  it('shows what each Rate basis multiplies', () => {
    const loads = (id: string) => (id === 'loads' ? 'Loads' : undefined);
    expect(
      formulaLabel(
        priced('a', 'cat', '2026-09-01T08:00:00Z', 24_475, { billedQuantity: 44.5, rateUnitAmount: 550 }),
        loads,
      ),
    ).toBe('44.5 h × R 550.00');
    expect(
      formulaLabel(
        priced('b', 'tip', '2026-09-01T08:00:00Z', 15_300, {
          rateBasis: 'measure',
          rateMeasureTypeId: 'loads',
          rateUnitAmount: 850,
          billedQuantity: 18,
        }),
        loads,
      ),
    ).toBe('18 loads × R 850.00');
    expect(
      formulaLabel(
        priced('c', 'tip', '2026-09-01T08:00:00Z', 0, {
          rateId: null,
          rateName: null,
          rateBasis: null,
          rateUnitAmount: 0,
        }),
        loads,
      ),
    ).toBe('No charge');
    expect(formulaLabel(priced('d', 'tip', '2026-09-01T08:00:00Z', 0, { rateUnitAmount: null }), loads)).toBeNull();
  });
});

describe('rate selection', () => {
  const rates = [rate('dry', 'Dry hire', 620), rate('load', 'Per load', 850, 'Loads')];

  it('lists active Rates in card order, keeps a snapshotted inactive Rate, and ends with No charge', () => {
    const stint = priced('a', 'cat', '2026-09-01T08:00:00Z', 6_000, { rateId: 'old', rateName: 'Old hire' });
    expect(rateSelectOptions(rates, stint)).toEqual([
      { value: 'dry', label: 'Dry hire · R 620.00 / h' },
      { value: 'load', label: 'Per load · R 850.00 / Loads' },
      { value: 'old', label: 'Old hire (inactive)' },
      { value: NO_CHARGE, label: 'No charge' },
    ]);
  });

  it('hints when the Rate Card amount has moved since the Rate was picked', () => {
    const stint = priced('a', 'cat', '2026-09-01T08:00:00Z', 6_000);
    expect(rateCardDrift(rates, stint)).toBe('Rate Card now R 620.00 / h — pick it again to use it.');
    expect(rateCardDrift([rate('dry', 'Dry hire', 600)], stint)).toBeNull();
  });
});
