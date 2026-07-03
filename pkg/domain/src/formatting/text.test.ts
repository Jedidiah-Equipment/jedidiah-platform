import { describe, expect, it } from 'vitest';

import { toSentenceCase } from './text.js';

describe('toSentenceCase', () => {
  it('capitalizes the first letter and lowercases the rest', () => {
    expect(toSentenceCase('PRIVATE')).toBe('Private');
  });

  it('handles empty strings', () => {
    expect(toSentenceCase('')).toBe('');
  });
});
