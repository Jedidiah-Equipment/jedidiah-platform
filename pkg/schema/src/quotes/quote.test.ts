import { describe, expect, it } from 'vitest';

import { QuoteCreateInput } from './quote.js';

const baseCreateInput = {
  customer: {
    type: 'inline' as const,
    companyName: 'Acme Mining',
  },
  notes: null,
  documentNotes: null,
  productId: '550e8400-e29b-41d4-a716-446655440000',
  salesPersonId: 'auth-user-1',
  status: 'draft' as const,
};

describe('QuoteCreateInput', () => {
  it('defaults discount and deposit percents to zero', () => {
    expect(QuoteCreateInput.parse(baseCreateInput)).toMatchObject({
      depositPercent: 0,
      discountAmount: 0,
    });
  });

  it('rejects a negative deposit percent', () => {
    expect(() =>
      QuoteCreateInput.parse({
        ...baseCreateInput,
        depositPercent: -1,
      }),
    ).toThrow();
  });

  it('rejects a deposit percent above 100', () => {
    expect(() =>
      QuoteCreateInput.parse({
        ...baseCreateInput,
        depositPercent: 101,
      }),
    ).toThrow();
  });
});
