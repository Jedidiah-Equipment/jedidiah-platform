import { describe, expect, it } from 'vitest';

import { describeSlotRelease, describeUnit } from '@/components/common/cancellation.js';
import { shouldOfferQuoteCancellation } from './quote-cancellation.js';

const lockedQuote = {
  hasEverSourcedJob: true,
  kind: 'product',
  productUnitId: null,
  status: 'accepted',
} as const;

describe('shouldOfferQuoteCancellation', () => {
  it('offers the header action for a locked Quote and administrator access', () => {
    expect(shouldOfferQuoteCancellation({ canCancel: true, quote: lockedQuote })).toBe(true);
  });

  it('withholds it without the permission, once cancelled, and while the Quote is still unlocked', () => {
    expect(shouldOfferQuoteCancellation({ canCancel: false, quote: lockedQuote })).toBe(false);
    expect(shouldOfferQuoteCancellation({ canCancel: true, quote: { ...lockedQuote, status: 'cancelled' } })).toBe(
      false,
    );
    expect(
      shouldOfferQuoteCancellation({
        canCancel: true,
        quote: { ...lockedQuote, hasEverSourcedJob: false, status: 'sent' },
      }),
    ).toBe(false);
  });

  // The Quote stays Locked after its Job is cancelled, so the action outlives the cascade it once ran.
  it('still offers cancellation for a Quote whose Job has already been cancelled', () => {
    expect(shouldOfferQuoteCancellation({ canCancel: true, quote: lockedQuote })).toBe(true);
  });
});

describe('cancellation copy', () => {
  it('names how many bay slots come back, and says none are owed when there are none', () => {
    expect(describeSlotRelease(0)).toContain('no upcoming slots to release');
    expect(describeSlotRelease(1)).toContain('1 upcoming slot is removed');
    expect(describeSlotRelease(3)).toContain('3 upcoming slots are removed');
  });

  it('names who holds the machine so nobody removes a serial blind', () => {
    expect(
      describeUnit({
        canRemove: true,
        ownerName: 'Acme Mining',
        productSerialNumber: 'CFO-001-26-1',
        productUnitId: '00000000-0000-4000-8000-000000001042',
        removeByDefault: true,
      }),
    ).toContain('Acme Mining currently holds it.');
    expect(
      describeUnit({
        canRemove: true,
        ownerName: null,
        productSerialNumber: 'CFO-001-26-1',
        productUnitId: '00000000-0000-4000-8000-000000001042',
        removeByDefault: true,
      }),
    ).toContain('It is held as stock.');
  });
});
