import { describe, expect, it } from 'vitest';

import {
  PARTS_SALE_DEFAULT_WORK_TITLE,
  partsSaleWorkTitle,
  quoteOfferingFieldError,
  toQuoteOfferingInput,
} from './quote-offering-input.js';

const productId = 'f36a4b28-d552-439c-8928-bf6da8aa42b2';
const productUnitId = '7354e714-083a-44a7-9310-b6240c3a1890';

describe('toQuoteOfferingInput', () => {
  it('maps a Product choice onto the product arm, reading an empty Unit as none', () => {
    expect(toQuoteOfferingInput('product', { productId, productUnitId: '', workTitle: '' })).toEqual({
      kind: 'product',
      productId,
      productUnitId: null,
    });
    expect(toQuoteOfferingInput('product', { productId, productUnitId, workTitle: '' })).toEqual({
      kind: 'product',
      productId,
      productUnitId,
    });
  });

  it('maps Service Work and a Parts Sale onto the custom arm, flagged apart', () => {
    expect(toQuoteOfferingInput('custom', { productId: '', workTitle: 'Hydraulic repair' })).toEqual({
      isPartsSale: false,
      kind: 'custom',
      workTitle: 'Hydraulic repair',
    });
    expect(toQuoteOfferingInput('parts-sale', { productId: '', workTitle: 'Parts sale' })).toEqual({
      isPartsSale: true,
      kind: 'custom',
      workTitle: 'Parts sale',
    });
  });
});

describe('partsSaleWorkTitle', () => {
  it('pre-fills an empty Work Title only when the quote becomes a Parts Sale', () => {
    expect(partsSaleWorkTitle('parts-sale', '')).toBe(PARTS_SALE_DEFAULT_WORK_TITLE);
    expect(partsSaleWorkTitle('parts-sale', '   ')).toBe(PARTS_SALE_DEFAULT_WORK_TITLE);
    expect(partsSaleWorkTitle('parts-sale', 'Bushes')).toBe('Bushes');
    expect(partsSaleWorkTitle('custom', '')).toBe('');
    expect(partsSaleWorkTitle('product', '')).toBe('');
  });
});

describe('quoteOfferingFieldError', () => {
  it('requires a Product for a Product offering', () => {
    expect(quoteOfferingFieldError('product', { productId: '', workTitle: '' })).toEqual({
      message: 'Select a product',
      path: 'productId',
    });
    expect(quoteOfferingFieldError('product', { productId, workTitle: '' })).toBeNull();
  });

  it.each(['custom', 'parts-sale'] as const)('requires a Work Title for a %s offering', (offeringType) => {
    expect(quoteOfferingFieldError(offeringType, { productId, workTitle: '  ' })).toEqual({
      message: 'Work title is required',
      path: 'workTitle',
    });
    expect(quoteOfferingFieldError(offeringType, { productId: '', workTitle: 'Repair' })).toBeNull();
  });
});
