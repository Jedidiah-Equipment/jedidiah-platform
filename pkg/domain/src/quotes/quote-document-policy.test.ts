import { describe, expect, it } from 'vitest';

import {
  canGenerateQuoteDocument,
  formatQuoteDocumentLeadTime,
  getDefaultQuoteDocumentLeadTime,
  isQuoteDocumentGenerationAllowed,
  resolveQuoteDocumentLeadTime,
} from './quote-document-policy.js';

describe('quote document generation policy', () => {
  it('allows generation for every status except rejected and cancelled', () => {
    expect(isQuoteDocumentGenerationAllowed('draft')).toBe(true);
    expect(isQuoteDocumentGenerationAllowed('sent')).toBe(true);
    expect(isQuoteDocumentGenerationAllowed('accepted')).toBe(true);
    expect(isQuoteDocumentGenerationAllowed('rejected')).toBe(false);
    expect(isQuoteDocumentGenerationAllowed('cancelled')).toBe(false);
  });

  it('requires resolved product facts for product quotes only', () => {
    expect(canGenerateQuoteDocument({ kind: 'custom', product: null, status: 'accepted' })).toBe(true);
    expect(canGenerateQuoteDocument({ kind: 'custom', product: null, status: 'rejected' })).toBe(false);
    expect(canGenerateQuoteDocument({ kind: 'product', product: null, status: 'sent' })).toBe(false);
    expect(canGenerateQuoteDocument({ kind: 'product', product: { buildTimeDays: 14 }, status: 'sent' })).toBe(true);
  });
});

describe('quote document lead time', () => {
  it('defaults from the Product build time on the saved Quote detail', () => {
    expect(getDefaultQuoteDocumentLeadTime({ product: { buildTimeDays: 21 } })).toBe('21 working days');
    expect(getDefaultQuoteDocumentLeadTime({ product: null })).toBe('');
    expect(formatQuoteDocumentLeadTime(34)).toBe('34 working days');
  });

  it('does not overwrite a user-edited lead time when availability arrives late', () => {
    expect(
      resolveQuoteDocumentLeadTime({
        availability: { defaultLeadTimeWorkingDays: 34 },
        fallbackLeadTime: '21 working days',
        hasUserEditedLeadTime: true,
        leadTime: 'Call customer first',
      }),
    ).toBe('Call customer first');
    expect(
      resolveQuoteDocumentLeadTime({
        availability: { defaultLeadTimeWorkingDays: 34 },
        fallbackLeadTime: '21 working days',
        hasUserEditedLeadTime: false,
        leadTime: '21 working days',
      }),
    ).toBe('34 working days');
  });
});
