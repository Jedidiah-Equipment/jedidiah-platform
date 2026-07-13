import { describe, expect, it } from 'vitest';

import { CANONICAL_LOCALE, LOCALES, Locale } from './locale.js';

describe('Locale', () => {
  it('defines the supported and canonical locales', () => {
    expect(LOCALES).toEqual(['en', 'af']);
    expect(CANONICAL_LOCALE).toBe('en');
    expect(Locale.parse('af')).toBe('af');
    expect(Locale.safeParse('fr').success).toBe(false);
  });
});
