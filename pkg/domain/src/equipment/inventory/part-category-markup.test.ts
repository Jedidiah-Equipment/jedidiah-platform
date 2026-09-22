import { describe, expect, it } from 'vitest';

import { applyPartCategoryMarkup } from './part-category-markup.js';

describe('applyPartCategoryMarkup', () => {
  it('marks a piece cost up by the category percentage, which may exceed 100', () => {
    expect(applyPartCategoryMarkup({ averageUnitCost: 80, markupPercent: 25 })).toEqual({
      reason: null,
      unitPrice: 100,
    });
    expect(applyPartCategoryMarkup({ averageUnitCost: 10, markupPercent: 150 })).toEqual({
      reason: null,
      unitPrice: 25,
    });
  });

  it('leaves a per-millimetre price unrounded', () => {
    expect(applyPartCategoryMarkup({ averageUnitCost: 0.1, markupPercent: 25 }).unitPrice).toBeCloseTo(0.125, 12);
  });

  it('prices at cost when the markup is 0%, which is a set markup and not a missing one', () => {
    expect(applyPartCategoryMarkup({ averageUnitCost: 42.5, markupPercent: 0 })).toEqual({
      reason: null,
      unitPrice: 42.5,
    });
  });

  it('offers no price when the cost or the markup is missing, and no-cost wins when both are', () => {
    expect(applyPartCategoryMarkup({ averageUnitCost: null, markupPercent: 25 })).toEqual({
      reason: 'no-cost',
      unitPrice: null,
    });
    expect(applyPartCategoryMarkup({ averageUnitCost: 80, markupPercent: null })).toEqual({
      reason: 'no-markup',
      unitPrice: null,
    });
    expect(applyPartCategoryMarkup({ averageUnitCost: null, markupPercent: null })).toEqual({
      reason: 'no-cost',
      unitPrice: null,
    });
  });
});
