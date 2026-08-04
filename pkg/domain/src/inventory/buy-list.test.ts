import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { compareBuyListRows, compareNullableDateOnly, deriveBuyListSignal } from './buy-list.js';

const demand = (facts: Partial<Parameters<typeof deriveBuyListSignal>[0]>) =>
  deriveBuyListSignal({ free: 0, hasStockHistory: true, minimumStock: null, onOrder: 0, quantity: 0, ...facts });

const date = (value: string) => value as DateOnlyIso;

describe('deriveBuyListSignal', () => {
  it('leaves a Part with cover, no reorder level, and stock on the shelf off the list', () => {
    expect(demand({ free: 4, minimumStock: null, onOrder: 0, quantity: 4 })).toEqual({
      reasons: [],
      shortfall: 0,
      suggestedQuantity: 0,
    });
  });

  it('tags negative free and asks for exactly what the Jobs are short', () => {
    expect(demand({ free: -3, minimumStock: null, onOrder: 0, quantity: 2 })).toEqual({
      reasons: ['negative-free'],
      shortfall: 3,
      suggestedQuantity: 3,
    });
  });

  it('nets what is already on order out of the suggestion', () => {
    expect(demand({ free: -5, minimumStock: null, onOrder: 2, quantity: 0 })).toMatchObject({
      shortfall: 5,
      suggestedQuantity: 3,
    });
  });

  it('suggests nothing once the open orders already cover the shortfall', () => {
    expect(demand({ free: -5, minimumStock: null, onOrder: 9, quantity: 0 })).toMatchObject({
      reasons: ['out-of-stock', 'negative-free'],
      shortfall: 5,
      suggestedQuantity: 0,
    });
  });

  it('tags a Part below its reorder level and asks for the gap up to it', () => {
    expect(demand({ free: 2, minimumStock: 10, onOrder: 0, quantity: 4 })).toEqual({
      reasons: ['below-minimum'],
      shortfall: 6,
      suggestedQuantity: 6,
    });
  });

  it('takes the larger of the two shortfalls rather than adding them', () => {
    // Both reasons describe the same shelf: buying 8 clears the Jobs and reaches the minimum at once.
    expect(demand({ free: -8, minimumStock: 10, onOrder: 0, quantity: 4 })).toEqual({
      reasons: ['negative-free', 'below-minimum'],
      shortfall: 8,
      suggestedQuantity: 8,
    });
  });

  it('leaves a Part that has never been stocked off the list entirely', () => {
    // Never bought is not "run out": a whole catalogue of unstocked Parts would pin the signal open.
    expect(demand({ free: 0, hasStockHistory: false, minimumStock: null, onOrder: 0, quantity: 0 })).toEqual({
      reasons: [],
      shortfall: 0,
      suggestedQuantity: 0,
    });
  });

  it('still tags a never-stocked Part a Job is waiting on, or one under its minimum', () => {
    expect(demand({ free: -2, hasStockHistory: false, quantity: 0 }).reasons).toEqual(['negative-free']);
    expect(demand({ hasStockHistory: false, minimumStock: 5, quantity: 0 }).reasons).toEqual(['below-minimum']);
  });

  it('tags an empty shelf even when nothing wants it', () => {
    expect(demand({ free: 0, minimumStock: null, onOrder: 0, quantity: 0 })).toEqual({
      reasons: ['out-of-stock'],
      shortfall: 0,
      suggestedQuantity: 0,
    });
  });

  it('tags a shelf that has gone negative as out of stock', () => {
    expect(demand({ free: -2, minimumStock: null, onOrder: 0, quantity: -2 })).toMatchObject({
      reasons: ['out-of-stock', 'negative-free'],
    });
  });

  it('reads a zero minimum as a Part with no reorder level to fall below', () => {
    expect(demand({ free: 1, minimumStock: 0, onOrder: 0, quantity: 1 })).toEqual({
      reasons: [],
      shortfall: 0,
      suggestedQuantity: 0,
    });
  });
});

describe('compareNullableDateOnly', () => {
  it('ranks the earlier date first and a missing date last', () => {
    expect(compareNullableDateOnly('2026-08-01', '2026-09-01')).toBeLessThan(0);
    expect(compareNullableDateOnly('2026-09-01', '2026-08-01')).toBeGreaterThan(0);
    expect(compareNullableDateOnly(null, '2026-09-01')).toBeGreaterThan(0);
    expect(compareNullableDateOnly('2026-09-01', null)).toBeLessThan(0);
  });

  it('reports equal dates and two missing dates as ties, so a caller can chain its own tiebreak', () => {
    expect(compareNullableDateOnly('2026-08-01', '2026-08-01')).toBe(0);
    expect(compareNullableDateOnly(null, null)).toBe(0);
  });
});

describe('compareBuyListRows', () => {
  it('ranks the earliest driving Slot date first', () => {
    const rows = [
      { earliestDemandDate: date('2026-09-01'), partCode: 'B' },
      { earliestDemandDate: date('2026-08-10'), partCode: 'C' },
    ];

    expect([...rows].sort(compareBuyListRows).map((row) => row.partCode)).toEqual(['C', 'B']);
  });

  it('ranks a Part no scheduled Job is waiting on last, not first', () => {
    const rows = [
      { earliestDemandDate: null, partCode: 'A' },
      { earliestDemandDate: date('2026-12-31'), partCode: 'Z' },
    ];

    expect([...rows].sort(compareBuyListRows).map((row) => row.partCode)).toEqual(['Z', 'A']);
  });

  it('falls back to Part code so equal dates hold a stable order', () => {
    const rows = [
      { earliestDemandDate: date('2026-08-10'), partCode: 'B' },
      { earliestDemandDate: date('2026-08-10'), partCode: 'A' },
      { earliestDemandDate: null, partCode: 'D' },
      { earliestDemandDate: null, partCode: 'C' },
    ];

    expect([...rows].sort(compareBuyListRows).map((row) => row.partCode)).toEqual(['A', 'B', 'C', 'D']);
  });
});
