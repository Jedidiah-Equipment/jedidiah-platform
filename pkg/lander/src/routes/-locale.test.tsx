import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { routeTree } from '../routeTree.gen.js';

vi.mock('../lib/site-origin.js', () => ({ siteOrigin: () => 'https://lander.example.test' }));
vi.mock('../lib/locale-preference.js', () => ({
  honorLocalePreference: () => undefined,
  persistLocalePreference: () => undefined,
}));
vi.mock('../styles/app.css?url', () => ({ default: '/styles/app.css' }));
vi.mock('../server/site/site-meta.js', () => ({ getSiteMeta: async () => ({ indexable: true }) }));
vi.mock('../server/catalog/ranges.js', () => ({
  getFooterRanges: async () => [],
  getHomeRanges: async () => [],
  getProductRangeCount: async () => 4,
  getRangeOptions: async () => [],
}));
vi.mock('../server/catalog/products.js', () => ({ getProductsCatalog: async () => ({ groups: [] }) }));
vi.mock('../server/catalog/product-detail.js', () => ({
  getProductDetail: async () => ({
    id: 'product-1',
    name: 'Chaser Bin',
    modelCode: 'CH-450',
    rangeName: 'Chaser Bins',
    rangeSlug: 'chaser-bins',
    tagline: 'Built for harvest',
    description: 'Catalog text stays canonical English for now.',
    imageUrl: '/images/products/product-1',
    ogImageUrl: '/images/products/product-1?format=og',
    galleryImages: [{ imageUrl: '/images/products/product-1', slot: 'primary' }],
    highlights: [],
    standardAssemblies: [],
    optionalAssemblies: [],
    keyFeatures: ['Heavy-duty chassis'],
    brochureHref: null,
    related: [],
  }),
}));

async function routerAt(href: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [href] }),
  });

  await router.load();
  return router;
}

describe('localized public routes', () => {
  test.each([
    '/af',
    '/af/about',
    '/af/contact',
    '/af/products',
    '/af/products/CH-450',
  ])('matches %s in the Afrikaans route context', async (href) => {
    const router = await routerAt(href);
    const localeContext = router.state.matches.map((match) => match.context).find((context) => 'locale' in context);

    expect(localeContext).toMatchObject({ locale: 'af' });
    expect(router.state.statusCode).toBe(200);
  });

  test('renders Afrikaans static copy while leaving catalog-authored text untouched', async () => {
    const router = await routerAt('/af/products/CH-450');
    const markup = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(markup).toContain('Kontak Ons');
    expect(markup).toContain('Kernkenmerke');
    expect(markup).toContain('Catalog text stays canonical English for now.');
  });

  test('keeps the unprefixed public tree in canonical English', async () => {
    const router = await routerAt('/about');
    const markup = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(markup).toContain('Farmers Building for Farmers');
    expect(markup).not.toContain('Boere Bou vir Boere');
  });

  test('rejects an unknown locale prefix instead of rendering English', async () => {
    const router = await routerAt('/fr/about');

    expect(router.state.statusCode).toBe(404);
    expect(router.state.matches.some((match) => match.status === 'notFound')).toBe(true);
  });

  test('emits localized title, canonical, and hreflang links from the route head', async () => {
    const router = await routerAt('/af/about');
    const assets = router.state.matches.flatMap((match) => [...(match.meta ?? []), ...(match.links ?? [])]);

    expect(assets).toContainEqual({ title: 'Oor Ons — Jedidiah Equipment' });
    expect(assets).toContainEqual({ rel: 'canonical', href: 'https://lander.example.test/af/about' });
    expect(assets).toContainEqual({ rel: 'alternate', hrefLang: 'en', href: 'https://lander.example.test/about' });
    expect(assets).toContainEqual({
      rel: 'alternate',
      hrefLang: 'af',
      href: 'https://lander.example.test/af/about',
    });
  });

  test.each([
    ['/health', '/health'],
    ['/robots.txt', '/robots.txt'],
    ['/sitemap.xml', '/sitemap.xml'],
    ['/api/contact', '/api/contact'],
    ['/images/products/product-1', '/images/products/$productId'],
    ['/images/ranges/range-1', '/images/ranges/$rangeId'],
    ['/downloads/products/product-1/brochure', '/downloads/products/$productId/brochure'],
    ['/info/e', '/info/$'],
    ['/info/static/recorder.js', '/info/static/$'],
  ])('keeps the non-page route %s outside the locale tree', (href, routeId) => {
    const router = createRouter({ routeTree, history: createMemoryHistory() });

    expect(router.matchRoutes(href).at(-1)?.routeId).toBe(routeId);
  });
});
