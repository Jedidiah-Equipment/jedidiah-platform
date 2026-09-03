import { describe, expect, it } from 'vitest';

import { deriveInvoicePriceCorrection } from './invoice-price-correction.js';

const AGREED = {
  averageUnitCost: 10,
  invoicedUnitCost: 12,
  receiptedUnitCost: 10,
  receivedQuantity: 100,
  stockOnHandBasis: 100,
};

describe('deriveInvoicePriceCorrection', () => {
  it('moves the average by the whole under-charge when everything received is still on hand', () => {
    expect(deriveInvoicePriceCorrection(AGREED)).toMatchObject({ canApply: true, newAverageUnitCost: 12 });
  });

  it('spreads the correction over what is left when some of the receipt has been drawn', () => {
    // R2 too cheap on 100 received, with 40 left: R200 of value lands on 40 units.
    expect(deriveInvoicePriceCorrection({ ...AGREED, stockOnHandBasis: 40 })).toMatchObject({
      canApply: true,
      newAverageUnitCost: 15,
    });
  });

  it('corrects downward when the Supplier billed under the agreed price', () => {
    expect(deriveInvoicePriceCorrection({ ...AGREED, invoicedUnitCost: 9 })).toMatchObject({
      canApply: true,
      newAverageUnitCost: 9,
    });
  });

  it('refuses when the stock has already been consumed, because the cost has nowhere to land', () => {
    expect(deriveInvoicePriceCorrection({ ...AGREED, stockOnHandBasis: 0 })).toMatchObject({
      canApply: false,
      newAverageUnitCost: null,
    });
    expect(deriveInvoicePriceCorrection({ ...AGREED, stockOnHandBasis: -5 })).toMatchObject({ canApply: false });
  });

  it('refuses when the Part carries no cost yet — there is no average to correct', () => {
    expect(deriveInvoicePriceCorrection({ ...AGREED, averageUnitCost: null })).toMatchObject({
      canApply: false,
      newAverageUnitCost: null,
    });
  });

  it('refuses when either side of the difference is missing', () => {
    expect(deriveInvoicePriceCorrection({ ...AGREED, invoicedUnitCost: null })).toMatchObject({ canApply: false });
    expect(deriveInvoicePriceCorrection({ ...AGREED, receiptedUnitCost: null })).toMatchObject({ canApply: false });
  });

  it('refuses when nothing was received against the line', () => {
    expect(deriveInvoicePriceCorrection({ ...AGREED, receivedQuantity: 0 })).toMatchObject({ canApply: false });
  });

  it('is a no-op when the invoice agrees with what the receipts were stamped at', () => {
    expect(deriveInvoicePriceCorrection({ ...AGREED, invoicedUnitCost: 10 })).toMatchObject({
      canApply: true,
      newAverageUnitCost: 10,
    });
  });

  it('floors at zero rather than posting a unit cost the ledger would refuse', () => {
    expect(
      deriveInvoicePriceCorrection({ ...AGREED, invoicedUnitCost: 0, receiptedUnitCost: 100, stockOnHandBasis: 10 }),
    ).toMatchObject({ canApply: true, newAverageUnitCost: 0 });
  });

  it('reports the figures it judged on, so the panel can show its working', () => {
    expect(deriveInvoicePriceCorrection({ ...AGREED, stockOnHandBasis: 40 })).toEqual({
      averageUnitCost: 10,
      canApply: true,
      newAverageUnitCost: 15,
      receiptedUnitCost: 10,
      receivedQuantity: 100,
      stockOnHandBasis: 40,
    });
  });
});
