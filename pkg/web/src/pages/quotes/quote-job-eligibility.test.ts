import { describe, expect, test } from 'vitest';

import { canCreateJobFromQuote } from './quote-job-eligibility.js';

describe('quote job eligibility', () => {
  test.each([
    ['draft', true],
    ['sent', true],
    ['accepted', true],
    ['rejected', false],
  ] as const)('returns %s eligibility as %s', (status, expected) => {
    expect(canCreateJobFromQuote({ jobId: null, status })).toBe(expected);
  });

  test('returns false when the quote already has a linked Job', () => {
    expect(canCreateJobFromQuote({ jobId: 'job-id', status: 'sent' })).toBe(false);
  });
});
