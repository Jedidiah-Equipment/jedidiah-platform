import type { Assignment, JobDetail, Rate, StintPricing } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import {
  adjustmentRows,
  formulaLabel,
  machinePricingRows,
  NO_CHARGE,
  rateCardDrift,
  rateSelectOptions,
} from './pricing.js';

type RatePricing = Extract<StintPricing, { kind: 'rate' }>;

const priced = (
  id: string,
  machineId: string,
  capturedAt: string,
  finalAmount: number,
  overrides: Partial<RatePricing> = {},
) =>
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
    pricing: {
      kind: 'rate',
      rateId: 'dry',
      name: 'Dry hire',
      basis: 'time',
      measureTypeId: null,
      measureTypeName: null,
      unitAmount: 600,
      billedQuantity: finalAmount / 600,
      measureMissing: false,
      computedAmount: finalAmount,
      finalAmount,
      amountEdited: false,
      ...overrides,
    },
  }) as unknown as Assignment;

const rate = (id: string, name: string, amount: number, measureTypeName: string | null = null) =>
  ({ id, name, amount, basis: measureTypeName ? 'measure' : 'time', measureTypeName }) as unknown as Rate;

describe('machinePricingRows', () => {
  it('orders machine lines and subtotals repeat stints by final amount', () => {
    const later = priced('a2', 'cat', '2026-09-03T08:00:00Z', 3_300);
    const first = priced('a1', 'cat', '2026-09-01T08:00:00Z', 6_000);
    const tipper = priced('b1', 'tip', '2026-09-02T08:00:00Z', 15_300);
    const rows = machinePricingRows([later, tipper, first]);

    expect(rows.map((row) => row.kind)).toEqual(['stint', 'stint', 'subtotal', 'stint']);
    expect(rows.map((row) => (row.kind === 'stint' ? row.firstOfMachine : undefined))).toEqual([
      true,
      false,
      undefined,
      true,
    ]);
    expect(rows[2]).toEqual({ kind: 'subtotal', machineCode: 'CAT', amount: 9_300 });
  });
});

describe('adjustmentRows', () => {
  it('lists supplied Diesel, and the Discount only when editable or set', () => {
    const job = {
      dieselLitres: 210,
      diesel: { unitPrice: 23, amount: 4_830, amountEdited: false },
      discount: null,
    } as unknown as JobDetail;

    expect(adjustmentRows(job, { editable: false }).map((row) => row.kind)).toEqual(['diesel']);
    const editable = adjustmentRows(job, { editable: true });
    expect(editable.map((row) => row.kind)).toEqual(['diesel', 'discount']);
    expect(editable.at(-1)).toEqual({ kind: 'discount', discount: null });
    expect(adjustmentRows({ ...job, dieselLitres: 0, diesel: null }, { editable: false })).toEqual([]);
  });
});

describe('formulaLabel', () => {
  it('shows what each Rate basis multiplies', () => {
    const timeStint = priced('a', 'cat', '2026-09-01T08:00:00Z', 24_475, { billedQuantity: 44.5, unitAmount: 550 });
    expect(formulaLabel(timeStint.pricing)).toBe('44.5 h × R 550.00');
    const measureStint = priced('b', 'tip', '2026-09-01T08:00:00Z', 15_300, {
      basis: 'measure',
      measureTypeId: 'loads',
      measureTypeName: 'Loads',
      unitAmount: 850,
      billedQuantity: 18,
    });
    expect(formulaLabel(measureStint.pricing)).toBe('18 loads × R 850.00');
    expect(formulaLabel({ kind: 'no-charge' })).toBe('No charge');
    expect(formulaLabel(null)).toBeNull();
  });
});

describe('rate selection', () => {
  const rates = [rate('dry', 'Dry hire', 620), rate('load', 'Per load', 850, 'Loads')];

  it('lists active Rates in card order, keeps a snapshotted inactive Rate, and ends with No charge', () => {
    const stint = priced('a', 'cat', '2026-09-01T08:00:00Z', 6_000, { rateId: 'old', name: 'Old hire' });
    expect(rateSelectOptions(rates, stint.pricing)).toEqual([
      { value: 'dry', label: 'Dry hire · R 620.00 / h' },
      { value: 'load', label: 'Per load · R 850.00 / Loads' },
      { value: 'old', label: 'Old hire (inactive)' },
      { value: NO_CHARGE, label: 'No charge' },
    ]);
  });

  it('hints when the Rate Card amount has moved since the Rate was picked', () => {
    const stint = priced('a', 'cat', '2026-09-01T08:00:00Z', 6_000);
    expect(rateCardDrift(rates, stint.pricing)).toBe('Rate Card now R 620.00 / h — pick it again to use it.');
    expect(rateCardDrift([rate('dry', 'Dry hire', 600)], stint.pricing)).toBeNull();
  });
});
