import { describe, expect, it } from 'vitest';

import { placeholderEmail } from './placeholder-email.js';

describe('placeholderEmail', () => {
  it('slugs the name, dropping accents and punctuation', () => {
    expect(placeholderEmail('  José van der Merwe! ')).toBe('jose-van-der-merwe@fleet.jedidiah.invalid');
  });

  it('appends the suffix after the slug', () => {
    expect(placeholderEmail('Sipho', 'a1b2c3')).toBe('sipho-a1b2c3@fleet.jedidiah.invalid');
  });

  it('falls back to person when the name has nothing to slug', () => {
    expect(placeholderEmail('—', 'a1b2c3')).toBe('person-a1b2c3@fleet.jedidiah.invalid');
  });
});
