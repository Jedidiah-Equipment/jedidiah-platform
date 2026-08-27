import { describe, expect, it } from 'vitest';

import {
  getQuoteOfferingName,
  getQuoteOfferingSubtitle,
  quoteKindLabels,
  quoteProductSourceOf,
} from './quote-display.js';

describe('quote kind presentation', () => {
  it('presents the custom kind as Service Work', () => {
    expect(quoteKindLabels.custom).toBe('Service Work');
  });
});

describe('quote display helpers', () => {
  it('uses product names for Product Quotes and the standard unresolved fallback', () => {
    expect(
      getQuoteOfferingName({
        kind: 'product',
        product: { buildTimeDays: 12, modelCode: 'EX-100', name: 'Excavator' },
        workTitle: null,
      }),
    ).toBe('Excavator');
    expect(
      getQuoteOfferingName({
        kind: 'product',
        product: null,
        workTitle: null,
      }),
    ).toBe('—');
  });

  it('uses work titles for Custom Quotes', () => {
    expect(
      getQuoteOfferingName({
        kind: 'custom',
        product: null,
        workTitle: 'Hydraulic repair',
      }),
    ).toBe('Hydraulic repair');
    expect(
      getQuoteOfferingName({
        kind: 'custom',
        product: null,
        workTitle: null,
      }),
    ).toBe('Service Work');
  });

  it('returns product and custom subtitles from one policy', () => {
    expect(
      getQuoteOfferingSubtitle({
        kind: 'product',
        product: { buildTimeDays: 12, modelCode: 'EX-100', name: 'Excavator' },
        workTitle: null,
      }),
    ).toEqual({ mono: false, text: 'EX-100 / 12d build' });
    expect(
      getQuoteOfferingSubtitle({
        kind: 'custom',
        product: null,
        workTitle: 'Hydraulic repair',
      }),
    ).toEqual({ mono: false, text: 'Service Work' });
  });
});

describe('quoteProductSourceOf', () => {
  it('reads a Product Quote naming a Unit as From Stock', () => {
    expect(quoteProductSourceOf({ kind: 'product', productUnitId: '5f1b2c3d-0000-4000-8000-000000000001' })).toBe(
      'stock',
    );
  });

  it('reads a Product Quote with no Unit as From Order', () => {
    expect(quoteProductSourceOf({ kind: 'product', productUnitId: null })).toBe('order');
  });

  it('gives a Custom Quote no product source', () => {
    expect(quoteProductSourceOf({ kind: 'custom', productUnitId: null })).toBeNull();
  });
});
