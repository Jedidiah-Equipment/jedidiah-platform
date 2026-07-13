import { describe, expect, test } from 'vitest';

import { handleExplicitLocalePreference } from './locale-preference-handler.js';

describe('handleExplicitLocalePreference', () => {
  test('overwrites a stored preference with an explicit choice and redirects with 302', () => {
    const request = new Request(
      'https://lander.example.test/locale/af?returnTo=%2Fproducts%2FCH-450%3Fx%3D1%23specifications',
      { headers: { cookie: 'jedidiah_locale=en' } },
    );

    const response = handleExplicitLocalePreference(request, 'af');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/af/products/CH-450?x=1#specifications');
    expect(response.headers.get('set-cookie')).toBe(
      'jedidiah_locale=af; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    );
  });

  test('falls back to the locale home page instead of allowing an external redirect', () => {
    const request = new Request('http://lander.example.test/locale/af?returnTo=https%3A%2F%2Fevil.example%2Fphishing');

    const response = handleExplicitLocalePreference(request, 'af');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/af');
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
  });
});
