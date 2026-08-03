import { describe, expect, it } from 'vitest';

import { deriveBuildConsumption, deriveBuildProducedUnitCost, deriveBuildWarnings } from './build.js';

describe('deriveBuildConsumption', () => {
  it('prefills each BOM line at its quantity times the build size', () => {
    const bomLines = [
      { componentPartId: 'bolt', quantity: 4 },
      { componentPartId: 'cylinder', quantity: 1 },
    ];

    expect(deriveBuildConsumption({ bomLines, quantity: 3 })).toEqual([
      { componentPartId: 'bolt', quantity: 12 },
      { componentPartId: 'cylinder', quantity: 3 },
    ]);
  });

  it('carries a measured component fractional quantity through the multiplication', () => {
    expect(deriveBuildConsumption({ bomLines: [{ componentPartId: 'paint', quantity: 0.25 }], quantity: 6 })).toEqual([
      { componentPartId: 'paint', quantity: 1.5 },
    ]);
  });
});

describe('deriveBuildWarnings', () => {
  it('stays quiet when the rack gave exactly what the BOM asked for', () => {
    expect(deriveBuildWarnings({ expectedQuantity: 12, quantity: 12, quantityOnHand: 40 })).toEqual([]);
  });

  it('flags a deviation in either direction without blocking it', () => {
    expect(deriveBuildWarnings({ expectedQuantity: 12, quantity: 14, quantityOnHand: 40 })).toEqual(['bom-deviation']);
    expect(deriveBuildWarnings({ expectedQuantity: 12, quantity: 9, quantityOnHand: 40 })).toEqual(['bom-deviation']);
  });

  it('lets a short rack go negative, saying so', () => {
    expect(deriveBuildWarnings({ expectedQuantity: 12, quantity: 12, quantityOnHand: 5 })).toEqual([
      'negative-stock-on-hand',
    ]);
  });

  it('raises both when the build both deviates and overdraws', () => {
    expect(deriveBuildWarnings({ expectedQuantity: 12, quantity: 20, quantityOnHand: 5 })).toEqual([
      'bom-deviation',
      'negative-stock-on-hand',
    ]);
  });
});

describe('deriveBuildProducedUnitCost', () => {
  it('divides the consumed value across the units produced', () => {
    const consumed = [
      { quantity: 12, unitCost: 2.5 },
      { quantity: 3, unitCost: 100 },
    ];

    expect(deriveBuildProducedUnitCost({ consumed, quantity: 3 })).toBe(110);
  });

  it('reads a trivial build as having no cost yet rather than as free', () => {
    // Raw-material BOM lines post nothing, so an all-fabricated build consumes no value at all.
    // Spec §5: a never-costed Part shows "no cost yet", never R0.00.
    expect(deriveBuildProducedUnitCost({ consumed: [], quantity: 5 })).toBeNull();
    expect(deriveBuildProducedUnitCost({ consumed: [{ quantity: 4, unitCost: null }], quantity: 5 })).toBeNull();
  });

  it('values a build from the costed components alone when only some carry a cost', () => {
    const consumed = [
      { quantity: 4, unitCost: null },
      { quantity: 2, unitCost: 50 },
    ];

    expect(deriveBuildProducedUnitCost({ consumed, quantity: 2 })).toBe(50);
  });

  it('preserves value: what the consume rows take out, the produce row puts back', () => {
    const consumed = [
      { quantity: 7, unitCost: 3.5 },
      { quantity: 2, unitCost: 11.25 },
    ];
    const quantity = 4;
    const producedUnitCost = deriveBuildProducedUnitCost({ consumed, quantity });

    const consumedValue = consumed.reduce((total, line) => total + line.quantity * (line.unitCost ?? 0), 0);
    expect((producedUnitCost ?? 0) * quantity - consumedValue).toBeCloseTo(0, 10);
  });
});
