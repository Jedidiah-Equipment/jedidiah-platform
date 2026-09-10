import { describe, expect, it } from 'vitest';
import { implementCodePrefix, nextImplementCode } from './implement-code.js';

describe('implement code suggestion', () => {
  it('derives an uppercase hyphenated prefix from the category name', () => {
    expect(implementCodePrefix('Gravel trailer')).toBe('GRAVEL-TRAILER');
    expect(implementCodePrefix('Tip trailer (6t)')).toBe('TIP-TRAILER-6T');
    expect(implementCodePrefix('  Ploeg / Ripper  ')).toBe('PLOEG-RIPPER');
    expect(implementCodePrefix('Sprühgerät')).toBe('SPRUHGERAT');
    expect(implementCodePrefix('???')).toBe('IMPLEMENT');
  });
  it('takes one past the highest suffix, ignoring other prefixes and never filling gaps', () => {
    expect(nextImplementCode('GRAVEL-TRAILER', [])).toBe('GRAVEL-TRAILER-1');
    expect(nextImplementCode('GRAVEL-TRAILER', ['GRAVEL-TRAILER-1', 'gravel-trailer-7', 'GRAVEL-TRAILER-3'])).toBe(
      'GRAVEL-TRAILER-8',
    );
    expect(nextImplementCode('DISC', ['DISC-2', 'DISC-HARROW-9', 'DISC-X'])).toBe('DISC-3');
    expect(nextImplementCode('TIP-TRAILER-6T', ['TIP-TRAILER-6T-2', 'TIP-TRAILER-1'])).toBe('TIP-TRAILER-6T-3');
  });
});
