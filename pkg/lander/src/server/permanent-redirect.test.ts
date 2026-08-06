import { describe, expect, test } from 'vitest';

import { permanentRedirectLocation } from './permanent-redirect.js';

describe('permanentRedirectLocation', () => {
  test.each([
    [
      'https://www.jedidiahequipment.co.za/products?range=crosshaul',
      'https://jedidiahequipment.co.za/products?range=crosshaul',
    ],
    [
      'https://www.jedidiahequipment.co.za/about-us/?source=legacy',
      'https://jedidiahequipment.co.za/about?source=legacy',
    ],
    [
      'https://www.jedidiahequipment.co.za/wp-content/uploads/2024/10/Jed_Flyers_Recharge-Slurry-Water-Tanks_JUL24_awVIZ.pdf',
      'https://jedidiahequipment.co.za/products',
    ],
    ['https://jedidiahequipment.co.za/about-us/?source=legacy', '/about'],
    [
      'https://jedidiahequipment.co.za/wp-content/uploads/2024/10/Jed_Flyers_Recharge-Slurry-Water-Tanks_JUL24_awVIZ.pdf',
      '/products',
    ],
    ['https://jedidiahequipment.co.za/products?range=crosshaul', null],
  ])('resolves %s to %s', (requestUrl, expectedLocation) => {
    expect(permanentRedirectLocation(requestUrl)).toBe(expectedLocation);
  });
});
