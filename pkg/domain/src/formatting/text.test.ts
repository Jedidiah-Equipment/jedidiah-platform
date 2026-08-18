import { describe, expect, it } from 'vitest';

import { getFirstName, toSentenceCase } from './text.js';

describe('getFirstName', () => {
  it('returns the first name from a display name', () => {
    expect(getFirstName('  Dean van Niekerk  ')).toBe('Dean');
    expect(getFirstName('Bonginkosi')).toBe('Bonginkosi');
  });
});

describe('toSentenceCase', () => {
  it('capitalizes the first letter and lowercases the rest', () => {
    expect(toSentenceCase('PRIVATE')).toBe('Private');
  });

  it('handles empty strings', () => {
    expect(toSentenceCase('')).toBe('');
  });
});
