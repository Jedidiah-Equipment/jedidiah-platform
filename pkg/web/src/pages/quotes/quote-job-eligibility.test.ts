import { describe, expect, test } from 'vitest';

import { canCreateJobFromQuote } from './quote-job-eligibility.js';

describe('quote job eligibility', () => {
  test.each([
    ['draft', true],
    ['sent', true],
    ['accepted', true],
    ['rejected', false],
  ] as const)('returns %s eligibility as %s', (status, expected) => {
    expect(canCreateJobFromQuote(status)).toBe(expected);
  });
});
