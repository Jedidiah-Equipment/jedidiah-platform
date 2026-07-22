// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LocaleProvider } from '../../../messages/index.js';
import type { ProductDetail } from '../../../server/catalog/product-detail-data.js';
import { AssembliesAndDownloads, Downloads, ProductShareButton } from './$modelCode.js';

const captureEvent = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/analytics.js', () => ({
  captureEvent,
  captureEventForNavigation: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  vi.restoreAllMocks();
});

describe('Downloads', () => {
  test('opens the generated Product brochure in a new tab', () => {
    const markup = renderToStaticMarkup(
      <Downloads brochureHref="/downloads/products/product-1/brochure" modelCode="CH14" />,
    );

    expect(markup).toContain('href="/downloads/products/product-1/brochure"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toContain('<h2');
    expect(markup).toContain('Downloads</h2>');
  });
});

describe('ProductShareButton', () => {
  test('copies the product URL and reports a completed clipboard share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    window.history.replaceState({}, '', '/products/CH14');
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () =>
      root?.render(
        <LocaleProvider locale="en">
          <ProductShareButton modelCode="CH14" name="Chaser Bin" />
        </LocaleProvider>,
      ),
    );
    await act(async () => container.querySelector('button')?.click());

    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/products/CH14');
    expect(captureEvent).toHaveBeenCalledWith('product_shared', { modelCode: 'CH14', method: 'clipboard' });
    expect(container.textContent).toContain('Link copied');
  });
});

describe('AssembliesAndDownloads', () => {
  test('keeps downloads and assembly groups together below the hero', () => {
    const detail = productDetail({
      brochureHref: '/downloads/products/product-1/brochure',
      keyFeatures: ['Heavy-duty chassis'],
      optionalAssemblies: ['Bin extension'],
      standardAssemblies: ['Auger'],
    });
    const markup = renderToStaticMarkup(<AssembliesAndDownloads detail={detail} />);

    expect(markup).not.toContain('Key Features');
    expect(markup.indexOf('Downloads')).toBeLessThan(markup.indexOf('Standard Assemblies'));
    expect(markup.indexOf('Standard Assemblies')).toBeLessThan(markup.indexOf('Optional Assemblies'));
  });
});

function productDetail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: 'product-1',
    name: 'Chaser Bin',
    modelCode: 'CH14',
    rangeName: 'Chaser Bins',
    rangeSlug: 'chaser-bins',
    variant: null,
    tagline: 'Built for harvest',
    description: 'A working product detail fixture.',
    imageUrl: '/images/products/product-1',
    ogImageUrl: '/images/products/product-1?format=og',
    galleryImages: [
      { imageUrl: '/images/products/product-1', slot: 'primary' },
      { imageUrl: '/images/products/product-1?slot=secondary1', slot: 'secondary1' },
      { imageUrl: '/images/products/product-1?slot=secondary2', slot: 'secondary2' },
    ],
    standardAssemblies: [],
    optionalAssemblies: [],
    keyFeatures: [],
    brochureHref: null,
    related: [],
    ...overrides,
  };
}
