import { describe, expect, test } from 'vitest';

import { en } from './en.js';
import { useMessages } from './index.js';

describe('useMessages', () => {
  test('returns the canonical English static copy', () => {
    const messages = useMessages();

    expect(messages).toBe(en);
    expect(messages.nav).toEqual({
      home: 'Home',
      products: 'Products',
      about: 'About Us',
      contact: 'Contact Us',
      menuLabel: 'Menu',
    });
    expect(messages.productDetail.relatedHeading('Chaser Bins')).toBe('More in Chaser Bins');
  });
});
