import { describe, expect, test } from 'vitest';

import { parseQuoteCodeNumber, QuoteCodeInput } from './public-code.js';

describe('QuoteCodeInput', () => {
  test.each([
    ['8', 'QUO-00008'],
    ['QUO-00008', 'QUO-00008'],
    ['quo-8', 'QUO-00008'],
    [8, 'QUO-00008'],
  ])('normalizes %j to %s', (input, expected) => {
    expect(QuoteCodeInput.parse(input)).toBe(expected);
  });

  test.each(['0', 'QUO-00000', 'quote 8', '', Number.MAX_SAFE_INTEGER + 1])('rejects %j', (input) => {
    expect(() => QuoteCodeInput.parse(input)).toThrow();
  });
});

describe('parseQuoteCodeNumber', () => {
  test('returns the stored numeric code for valid shorthand and undefined for other search text', () => {
    expect(parseQuoteCodeNumber('QUO-00008')).toBe(8);
    expect(parseQuoteCodeNumber('customer 8')).toBeUndefined();
  });
});
