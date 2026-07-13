import { describe, expect, test } from 'vitest';

import { brochureResponse, resolveBrochureLocale } from './brochure-handlers.js';

describe('brochureResponse', () => {
  test('streams the generated PDF bytes with an inline download filename', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const response = brochureResponse({ bytes, filename: 'CH14-brochure.pdf' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="CH14-brochure.pdf"');
    expect(response.headers.get('content-length')).toBe('4');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  test('returns a 404 when there is no brochure (unknown id or an incomplete config)', () => {
    const response = brochureResponse(null);

    expect(response.status).toBe(404);
  });
});

describe('resolveBrochureLocale', () => {
  test.each([
    ['https://example.com/downloads/products/1/brochure', 'en'],
    ['https://example.com/downloads/products/1/brochure?locale=en', 'en'],
    ['https://example.com/downloads/products/1/brochure?locale=af', 'af'],
    ['https://example.com/downloads/products/1/brochure?locale=unsupported', 'en'],
  ] as const)('resolves %s to %s', (url, locale) => {
    expect(resolveBrochureLocale(url)).toBe(locale);
  });
});
