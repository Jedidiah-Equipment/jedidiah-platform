import type { StoredFile } from '@pkg/db';
import { Product } from '@pkg/schema';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { getBrochureDocumentModel } from './product-brochure-document.js';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const RANGE_ID = '22222222-2222-4222-8222-222222222222';

describe('getBrochureDocumentModel', () => {
  test('selects Afrikaans catalog text with per-field canonical fallback', async () => {
    const product = brochureProduct({
      assemblies: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          kind: 'standard',
          name: 'Hydraulic tailgate',
          parts: [],
          productId: PRODUCT_ID,
          translations: {
            af: {
              name: 'Hidrouliese agterklap',
              sourceHash: 'assembly-hash',
              translatedAt: '2026-07-13T00:00:00.000Z',
            },
          },
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          kind: 'optional',
          name: 'Working lights',
          overrideStandardAssemblyIds: [],
          parts: [],
          price: 100,
          productId: PRODUCT_ID,
        },
      ],
      keyFeatures: ['Canonical feature'],
      nameHighlight: 'Product',
      translations: {
        af: {
          category: 'Kuilvoer en graan',
          description: null,
          keyFeatures: ['Afrikaanse kenmerk'],
          name: 'Toetsproduk',
          nameHighlight: null,
          sourceHash: 'product-hash',
          technicalDetails: [],
          translatedAt: '2026-07-13T00:00:00.000Z',
        },
      },
    });

    const document = await getBrochureDocumentModel({
      images: {},
      locale: 'af',
      product,
      rangeLogo: null,
      storage: new InMemoryStorageAdapter(),
    });

    expect(document).toMatchObject({
      bodyCopy: ['Built for demanding field conditions.'],
      keyFeatures: ['Afrikaanse kenmerk'],
      optionalAssemblies: ['Working lights'],
      standardAssemblies: ['Hidrouliese agterklap'],
      subtitle: 'Kuilvoer en graan',
      title: 'Toetsproduk',
      titleHighlight: 'Product',
    });
  });

  test('trims excessive vertical padding from a landscape Range logo', async () => {
    const logoBytes = await paddedLandscapeLogo();
    const rangeLogo = await storeRangeLogo(logoBytes);

    const document = await getBrochureDocumentModel({
      images: {},
      product: brochureProduct(),
      rangeLogo: rangeLogo.ref,
      storage: rangeLogo.storage,
    });

    expect(await dataUriDimensions(document.rangeLogo?.dataUri)).toEqual({ height: 40, width: 160 });
  });

  test('keeps a tightly cropped square Range logo canvas', async () => {
    const logoBytes = await sharp({
      create: { background: '#111111', channels: 3, height: 100, width: 100 },
    })
      .png()
      .toBuffer();
    const rangeLogo = await storeRangeLogo(logoBytes);

    const document = await getBrochureDocumentModel({
      images: {},
      product: brochureProduct(),
      rangeLogo: rangeLogo.ref,
      storage: rangeLogo.storage,
    });

    expect(await dataUriDimensions(document.rangeLogo?.dataUri)).toEqual({ height: 100, width: 100 });
  });
});

async function paddedLandscapeLogo(): Promise<Uint8Array> {
  const mark = await sharp({
    create: { background: '#111111', channels: 3, height: 40, width: 160 },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { background: '#ffffff', channels: 3, height: 500, width: 500 },
  })
    .composite([{ input: mark, left: 170, top: 230 }])
    .png()
    .toBuffer();
}

async function storeRangeLogo(bytes: Uint8Array): Promise<{
  ref: StoredFile;
  storage: InMemoryStorageAdapter;
}> {
  const storage = new InMemoryStorageAdapter();
  const storageKey = 'range-logos/product-range/range/logo.png';

  await storage.put({ body: bytes, byteSize: bytes.byteLength, contentType: 'image/png', key: storageKey });

  return {
    ref: {
      byteSize: bytes.byteLength,
      contentType: 'image/png',
      storageKey,
      updatedAt: '2026-07-13T00:00:00.000Z',
    },
    storage,
  };
}

async function dataUriDimensions(dataUri: string | undefined): Promise<{ height: number; width: number }> {
  if (!dataUri) {
    throw new Error('Expected a resolved Range logo');
  }

  const metadata = await sharp(Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64')).metadata();

  if (!metadata.height || !metadata.width) {
    throw new Error('Expected Range logo dimensions');
  }

  return { height: metadata.height, width: metadata.width };
}

function brochureProduct(overrides: Partial<Product> = {}): Product {
  return Product.parse({
    assemblies: [],
    basePrice: 1_000,
    brochureEnabled: true,
    buildTimeDays: 5,
    category: 'Silage & Grain',
    createdAt: '2026-07-13T00:00:00.000Z',
    currencyCode: 'ZAR',
    description: 'Built for demanding field conditions.',
    id: PRODUCT_ID,
    images: {
      banner: null,
      primary: null,
      secondary1: null,
      secondary2: null,
      technicalDrawing: null,
    },
    keyFeatures: [],
    landerEnabled: false,
    modelCode: 'TEST-100',
    name: 'Test Product',
    nameHighlight: null,
    productBays: [],
    range: { id: RANGE_ID, name: 'Test Range' },
    rangeId: RANGE_ID,
    requiresVinNumber: false,
    technicalDetails: [],
    thumbnailDataUrl: null,
    updatedAt: '2026-07-13T00:00:00.000Z',
    variant: null,
    variantId: null,
    ...overrides,
  });
}
