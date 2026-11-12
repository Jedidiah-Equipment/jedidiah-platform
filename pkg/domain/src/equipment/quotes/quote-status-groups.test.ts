import { getQuoteDeliveryAcceptanceError } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { PARTS_SALE_CHECKOUT_STATUSES } from '../inventory/checkout.js';
import { editableQuoteStatuses, getQuoteDeliveryTermsOptions } from './quote-display.js';
import { isQuoteLocked } from './quote-lock.js';
import { canStartJobFromQuote } from './quote-start-job.js';

// No Quote holds a post-sale status yet; these pin how each reader treats one once #1953 writes them.
const postSaleStatuses = ['awaiting-approval', 'awaiting-invoice', 'invoiced'] as const;

describe('a Quote past acceptance', () => {
  it.each(postSaleStatuses)('is Locked in %s whatever its kind', (status) => {
    for (const kind of ['product', 'custom'] as const) {
      expect(isQuoteLocked({ hasEverSourcedJob: false, hasProductUnit: false, kind, status })).toBe(true);
    }
  });

  it.each(postSaleStatuses)('offers no To be confirmed delivery term in %s', (status) => {
    expect(getQuoteDeliveryTermsOptions(status).map((option) => option.value)).not.toContain('tbc');
    expect(getQuoteDeliveryAcceptanceError({ deliveryTerms: 'tbc', status })).not.toBeNull();
  });

  it.each(postSaleStatuses)('can start its Job in %s', (status) => {
    for (const kind of ['product', 'custom'] as const) {
      expect(
        canStartJobFromQuote({
          hasLiveJob: false,
          hasProductUnit: false,
          offering: kind === 'product' ? { kind } : { isPartsSale: false, kind },
          reworkRequired: false,
          status,
        }),
      ).toEqual({ allowed: true });
    }
  });

  it.each(postSaleStatuses)('still allows Parts Sale checkout in %s', (status) => {
    expect(PARTS_SALE_CHECKOUT_STATUSES.has(status)).toBe(true);
  });
});

describe('editableQuoteStatuses', () => {
  it('offers the pickable statuses and Cancelled', () => {
    expect(editableQuoteStatuses('sent')).toEqual(['draft', 'sent', 'accepted', 'rejected', 'cancelled']);
  });

  it('adds a post-sale Quote its own status so the field never renders blank', () => {
    expect(editableQuoteStatuses('awaiting-invoice')).toEqual([
      'draft',
      'sent',
      'accepted',
      'rejected',
      'cancelled',
      'awaiting-invoice',
    ]);
  });
});
