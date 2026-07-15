import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { routeTree } from '../routeTree.gen.js';
import type { CatalogGroup } from '../server/catalog/products-data.js';

let productGroups: CatalogGroup[] = [];

vi.mock('../lib/site-origin.js', () => ({ siteOrigin: () => 'https://lander.example.test' }));
vi.mock('../lib/locale-preference.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/locale-preference.js')>('../lib/locale-preference.js');
  return { ...actual, honorLocalePreference: () => undefined };
});
vi.mock('../styles/app.css?url', () => ({ default: '/styles/app.css' }));
vi.mock('../server/site/site-meta.js', () => ({ getSiteMeta: async () => ({ indexable: true }) }));
vi.mock('../server/catalog/ranges.js', () => ({
  getFooterRanges: async () => [],
  getHomeRanges: async () => [],
  getProductRangeCount: async () => 4,
  getRangeOptions: async () => [],
}));
vi.mock('../server/catalog/products.js', () => ({ getProductsCatalog: async () => ({ groups: productGroups }) }));
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

  test('renders internal links prefixed for the active locale', async () => {
    const afMarkup = renderToStaticMarkup(<RouterProvider router={await routerAt('/af/about')} />);
    const enMarkup = renderToStaticMarkup(<RouterProvider router={await routerAt('/about')} />);

    expect(afMarkup).toContain('href="/af"');
    expect(afMarkup).toContain('href="/af/products"');
    expect(enMarkup).toContain('href="/"');
    expect(enMarkup).toContain('href="/products"');
    expect(enMarkup).not.toContain('href="/af/');
  });

  test('highlights Products without also highlighting Home on the Products page', async () => {
    const markup = renderToStaticMarkup(<RouterProvider router={await routerAt('/products')} />);

    expect(markup).toMatch(/<a(?=[^>]*href="\/")(?=[^>]*class="[^"]*text-\[#cfcfcf\][^"]*")[^>]*>Home<\/a>/);
    expect(markup).toMatch(/<a(?=[^>]*href="\/products")(?=[^>]*class="[^"]*text-yellow[^"]*")[^>]*>Products/);
  });

  test('only shows the Range filter when the catalog has multiple Ranges', async () => {
    productGroups = [catalogGroup('range-one', true)];

    try {
      const singleRangeMarkup = renderToStaticMarkup(<RouterProvider router={await routerAt('/products')} />);

      productGroups.push(catalogGroup('range-two'));
      const multipleRangeMarkup = renderToStaticMarkup(<RouterProvider router={await routerAt('/products')} />);

      expect(singleRangeMarkup).not.toContain('Filter by range');
      expect(singleRangeMarkup).toContain('Filter by variant');
      expect(singleRangeMarkup).toContain('variant-one');
      expect(multipleRangeMarkup).toContain('Filter by range');
    } finally {
      productGroups = [];
    }
  });

  test('renders language choices as server-backed links that work without client-side cookie writes', async () => {
    const router = await routerAt('/about');
    const markup = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(markup).toContain('href="/locale/af?returnTo=%2Faf%2Fabout"');
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
    ['/locale/af?returnTo=%2Faf%2Fproducts', '/locale/$locale'],
  ])('keeps the non-page route %s outside the locale tree', (href, routeId) => {
    const router = createRouter({ routeTree, history: createMemoryHistory() });

    expect(router.matchRoutes(href).at(-1)?.routeId).toBe(routeId);
  });
});

function catalogGroup(id: string, withVariant = false): CatalogGroup {
  return {
    id,
    slug: id,
    name: id,
    label: id,
    description: '',
    count: 0,
    variants: withVariant
      ? [{ id: 'variant-one', slug: 'variant-one', name: 'variant-one', label: 'variant-one' }]
      : [],
    products: [],
  };
}
