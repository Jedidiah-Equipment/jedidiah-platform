import { describe, expect, test } from 'vitest';

import { af } from './af.js';
import { en } from './en.js';
import { messagesForLocale } from './index.js';

describe('messagesForLocale', () => {
  test('returns the canonical English static copy for en', () => {
    expect(messagesForLocale('en')).toBe(en);
    expect(en.productDetail.relatedHeading('Chaser Bins')).toBe('More in Chaser Bins');
  });

  test('returns complete Afrikaans static copy for af', () => {
    expect(messagesForLocale('af')).toBe(af);
    expect(af.nav.home).toBe('Tuis');
    expect(af.productDetail.relatedHeading('Graanwaens')).toBe('Meer in Graanwaens');
  });
});
