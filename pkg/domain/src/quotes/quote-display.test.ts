import { describe, expect, it } from 'vitest';

import { getQuoteOfferingName, getQuoteOfferingSubtitle } from './quote-display.js';

describe('quote display helpers', () => {
  it('uses product names for Product Quotes and the standard unresolved fallback', () => {
    expect(
      getQuoteOfferingName({
        kind: 'product',
        productBuildTimeDays: 12,
        productModelCode: 'EX-100',
        productName: 'Excavator',
        workTitle: null,
      }),
    ).toBe('Excavator');
    expect(
      getQuoteOfferingName({
        kind: 'product',
        productBuildTimeDays: null,
        productModelCode: null,
        productName: null,
        workTitle: null,
      }),
    ).toBe('—');
  });

  it('uses work titles for Custom Quotes', () => {
    expect(
      getQuoteOfferingName({
        kind: 'custom',
        productBuildTimeDays: null,
        productModelCode: null,
        productName: null,
        workTitle: 'Hydraulic repair',
      }),
    ).toBe('Hydraulic repair');
  });

  it('returns product and custom subtitles from one policy', () => {
    expect(
      getQuoteOfferingSubtitle({
        kind: 'product',
        productBuildTimeDays: 12,
        productModelCode: 'EX-100',
        productName: 'Excavator',
        workTitle: null,
      }),
    ).toEqual({ mono: false, text: 'EX-100 / 12d build' });
    expect(
      getQuoteOfferingSubtitle({
        kind: 'custom',
        productBuildTimeDays: null,
        productModelCode: null,
        productName: null,
        workTitle: 'Hydraulic repair',
      }),
    ).toEqual({ mono: false, text: 'Custom work' });
  });
});
