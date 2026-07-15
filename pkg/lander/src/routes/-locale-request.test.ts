import type { AddressInfo } from 'node:net';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const nativeFetch = globalThis.fetch;
let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.startsWith('https://us.i.posthog.com/')) {
      return new Response(null, { status: 204 });
    }
    return nativeFetch(input, init);
  });

  server = await createServer({
    configFile: new URL('../../vite.config.ts', import.meta.url).pathname,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer?.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await server.close();
});

async function request(
  path: string,
  { acceptLanguage, cookie }: { acceptLanguage?: string | undefined; cookie?: string | undefined } = {},
): Promise<Response> {
  const headers = new Headers();
  if (acceptLanguage) {
    headers.set('accept-language', acceptLanguage);
  }
  if (cookie) {
    headers.set('cookie', cookie);
  }

  return nativeFetch(`${origin}${path}`, { headers, redirect: 'manual' });
}

describe('locale preference HTTP boundary', () => {
  test.each([
    ['/about-us/', '/about'],
    ['/contact-us/', '/contact'],
    ['/cross-haul-trailer-range/', '/products'],
    ['/st300-strip-till-range/', '/products'],
    ['/hd2020-in-line-ripper-range/', '/products'],
    ['/elementor-265/', '/products'],
  ] as const)('permanently redirects legacy URL %s to %s', async (path, expectedLocation) => {
    const response = await request(path);

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(expectedLocation);
    await response.arrayBuffer();
  });

  test.each([
    ['/products', 'af-ZA', 302, 'af', '/af/products'],
    ['/products', 'en-ZA', 200, 'en', null],
    ['/products', undefined, 200, 'en', null],
    ['/af/about', 'af-ZA', 200, 'af', null],
    ['/af/about', 'en-ZA', 200, 'af', null],
    ['/af/about', undefined, 200, 'af', null],
  ] as const)('handles first visit %s with Accept-Language %s', async (path, acceptLanguage, expectedStatus, expectedCookie, expectedLocation) => {
    const response = await request(path, { acceptLanguage });

    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get('set-cookie')).toContain(`jedidiah_locale=${expectedCookie}`);
    expect(response.headers.get('location')).toBe(expectedLocation);
    await response.arrayBuffer();
  });

  test('stored preferences win over mismatched deep links and preserve query strings', async () => {
    // The legacy `<locale>.<source>` cookie format from earlier visitors must keep working.
    const explicitResponse = await request('/products/CH-450?x=1', { cookie: 'jedidiah_locale=af.explicit' });
    const autoResponse = await request('/af/about', { cookie: 'jedidiah_locale=en.auto' });

    expect(explicitResponse.status).toBe(302);
    expect(explicitResponse.headers.get('location')).toBe('/af/products/CH-450?x=1');
    expect(autoResponse.status).toBe(302);
    expect(autoResponse.headers.get('location')).toBe('/about');
  });

  test('explicit language route overwrites a stored preference with a 302 response', async () => {
    const response = await request('/locale/af?returnTo=%2Fproducts%3Fx%3D1', {
      cookie: 'jedidiah_locale=en',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/af/products?x=1');
    expect(response.headers.get('set-cookie')).toContain('jedidiah_locale=af');
  });

  test.each([
    '/api/contact',
    '/images/products/00000000-0000-0000-0000-000000000000',
    '/downloads/products/00000000-0000-0000-0000-000000000000/brochure',
    '/health',
    '/robots.txt',
    '/sitemap.xml',
    '/info/e',
  ])('never applies locale preference redirects to %s', async (path) => {
    const response = await request(path, { acceptLanguage: 'af-ZA' });

    expect(response.status).not.toBe(302);
    expect(response.headers.get('set-cookie')).toBeNull();
    await response.arrayBuffer();
  });

  test.each([
    '/downloads/products/00000000-0000-0000-0000-000000000000/brochure',
    '/downloads/products/00000000-0000-0000-0000-000000000000/brochure?locale=af',
  ])('returns 404 for an unknown brochure in either locale at %s', async (path) => {
    const response = await request(path);

    expect(response.status).toBe(404);
    await response.arrayBuffer();
  });
});
