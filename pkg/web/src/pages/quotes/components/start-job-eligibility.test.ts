import { describe, expect, it } from 'vitest';

import { canStartJobFromQuote, getStartJobUnavailableMessage } from './start-job-eligibility.js';

describe('start Job eligibility', () => {
  it('does not offer a Rework Job when an Allocation Quote adds no Assemblies', () => {
    const quote = {
      job: null,
      kind: 'product' as const,
      productUnitId: '10000000-0000-4000-8000-000000000000',
      reworkRequired: false,
      status: 'accepted' as const,
    };

    expect(canStartJobFromQuote(quote)).toBe(false);
    expect(getStartJobUnavailableMessage(quote, true)).toBe('Allocation Quote has no new Assemblies to fit.');
  });

  it('offers a Rework Job when an Allocation Quote adds Assemblies', () => {
    expect(
      canStartJobFromQuote({
        job: null,
        kind: 'product',
        productUnitId: '10000000-0000-4000-8000-000000000000',
        reworkRequired: true,
        status: 'accepted',
      }),
    ).toBe(true);
  });
});
