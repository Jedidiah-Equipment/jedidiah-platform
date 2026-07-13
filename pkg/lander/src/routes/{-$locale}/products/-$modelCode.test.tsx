import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import type { ProductDetail } from '../../../server/catalog/product-detail-data.js';
import { AssembliesAndFeatures, Downloads } from './$modelCode.js';

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

describe('AssembliesAndFeatures', () => {
  test('lays out key features and downloads before the assembly columns', () => {
    const detail = productDetail({
      brochureHref: '/downloads/products/product-1/brochure',
      keyFeatures: ['Heavy-duty chassis'],
      optionalAssemblies: ['Bin extension'],
      standardAssemblies: ['Auger'],
    });
    const markup = renderToStaticMarkup(<AssembliesAndFeatures detail={detail} />);

    expect(markup.indexOf('Key Features')).toBeLessThan(markup.indexOf('Downloads'));
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
    tagline: 'Built for harvest',
    description: 'A working product detail fixture.',
    imageUrl: '/images/products/product-1',
    ogImageUrl: '/images/products/product-1?format=og',
    galleryImages: [
      { imageUrl: '/images/products/product-1', slot: 'primary' },
      { imageUrl: '/images/products/product-1?slot=secondary1', slot: 'secondary1' },
      { imageUrl: '/images/products/product-1?slot=secondary2', slot: 'secondary2' },
    ],
    highlights: [],
    standardAssemblies: [],
    optionalAssemblies: [],
    keyFeatures: [],
    brochureHref: null,
    related: [],
    ...overrides,
  };
}
