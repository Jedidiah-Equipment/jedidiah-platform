import { productAssemblies, productRanges, productRangeVariants, products, user } from '@pkg/db';
import { catalogSourceHashes } from '@pkg/domain';
import { describe, expect, vi } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

import { translationEnvelopes } from './translation-test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    createdAt: new Date(),
    email: 'actor@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Actor',
    role: 'admin',
    updatedAt: new Date(),
  });

  const rangeCanonical = { description: 'Harvest equipment.', name: 'Trailers' };
  const [range] = await db
    .insert(productRanges)
    .values({
      ...rangeCanonical,
      displayOrder: 0,
      translations: { af: translationEnvelopes(rangeCanonical, { description: 'Oestoerusting.', name: 'Sleepwaens' }) },
    })
    .returning({ id: productRanges.id });
  if (!range) throw new Error('Range fixture missing');

  const [variant] = await db
    .insert(productRangeVariants)
    .values({
      displayOrder: 0,
      name: 'Heavy Duty',
      rangeId: range.id,
      translations: { af: translationEnvelopes({ name: 'Heavy Duty' }, { name: 'Swaardiens' }) },
    })
    .returning({ id: productRangeVariants.id });
  if (!variant) throw new Error('Variant fixture missing');

  const productCanonical = {
    category: 'Silage',
    description: 'Built for harvest.',
    keyFeatures: ['High capacity'],
    name: 'Silage Trailer',
    nameHighlight: 'XL',
    technicalDetails: [{ label: 'Capacity', value: '42 m³' }],
  };
  const [product] = await db
    .insert(products)
    .values({
      ...productCanonical,
      basePrice: 1_000,
      buildTimeDays: 14,
      modelCode: 'ST-42',
      rangeId: range.id,
      translations: {
        af: translationEnvelopes(productCanonical, {
          category: 'Kuilvoer',
          description: 'Gebou vir die oes.',
          keyFeatures: ['Hoë kapasiteit'],
          name: 'Kuilvoer-sleepwa',
          nameHighlight: 'XL',
          technicalDetails: [{ label: 'Kapasiteit', value: '42 m³' }],
        }),
      },
    })
    .returning({ id: products.id });
  if (!product) throw new Error('Product fixture missing');

  const [assembly] = await db
    .insert(productAssemblies)
    .values({
      displayOrder: 0,
      kind: 'standard',
      name: 'Hydraulic tailgate',
      productId: product.id,
      translations: {
        af: translationEnvelopes({ name: 'Hydraulic tailgate' }, { name: 'Hidrouliese agterklap' }),
      },
    })
    .returning({ id: productAssemblies.id });
  if (!assembly) throw new Error('Assembly fixture missing');

  return { assemblyId: assembly.id, db, productId: product.id, rangeId: range.id, variantId: variant.id };
});

describe('catalog translation overrides', () => {
  test('gets Product fields and manages manual Product and Assembly overrides', async ({ context }) => {
    const marker = { mark: vi.fn(), markNow: vi.fn() };
    const caller = context.createCaller(undefined, { catalogTranslationScheduler: marker });

    await expect(caller.catalogTranslations.getProduct({ id: context.productId })).resolves.toMatchObject({
      assemblies: [
        {
          id: context.assemblyId,
          fields: {
            name: {
              canonical: 'Hydraulic tailgate',
              state: 'fresh',
              translation: { isManual: false, value: 'Hidrouliese agterklap' },
            },
          },
        },
      ],
      fields: {
        description: {
          canonical: 'Built for harvest.',
          state: 'fresh',
          translation: { isManual: false, value: 'Gebou vir die oes.' },
        },
      },
      id: context.productId,
    });

    const manual = await caller.catalogTranslations.updateProduct({
      assemblies: [{ id: context.assemblyId, fields: { name: { isManual: true, value: 'My handmatige agterklap' } } }],
      fields: { description: { isManual: true, value: 'My handmatige beskrywing.' } },
      id: context.productId,
    });
    expect(manual.fields.description).toMatchObject({
      state: 'fresh',
      translation: {
        isManual: true,
        sourceHash: catalogSourceHashes({ description: 'Built for harvest.' }).description,
        value: 'My handmatige beskrywing.',
      },
    });
    expect(manual.assemblies[0]?.fields.name.translation).toMatchObject({
      isManual: true,
      value: 'My handmatige agterklap',
    });
    expect(marker.mark).not.toHaveBeenCalled();
    expect(marker.markNow).not.toHaveBeenCalled();

    const product = await caller.products.get({ id: context.productId });
    await caller.products.update({
      basePrice: product.basePrice,
      brochureEnabled: product.brochureEnabled,
      buildTimeDays: product.buildTimeDays,
      currencyCode: product.currencyCode,
      description: 'Updated English source.',
      id: product.id,
      landerEnabled: product.landerEnabled,
      modelCode: product.modelCode,
      name: product.name,
      rangeId: product.rangeId,
      requiresVinNumber: product.requiresVinNumber,
      thumbnailDataUrl: product.thumbnailDataUrl,
    });
    // The English source changed, so the Product is marked — but a manual field is never AI-queued.
    expect(marker.mark).toHaveBeenCalledWith(`product:${context.productId}`);
    const needsReview = await caller.catalogTranslations.getProduct({ id: context.productId });
    expect(needsReview.fields.description.state).toBe('needsReview');

    const reviewed = await caller.catalogTranslations.updateProduct({
      fields: { description: { isManual: true, value: 'Hersiene handmatige beskrywing.' } },
      id: context.productId,
    });
    expect(reviewed.fields.description).toMatchObject({
      state: 'fresh',
      translation: {
        sourceHash: catalogSourceHashes({ description: 'Updated English source.' }).description,
        value: 'Hersiene handmatige beskrywing.',
      },
    });

    const reverted = await caller.catalogTranslations.updateProduct({
      fields: { description: { isManual: false } },
      id: context.productId,
    });
    expect(reverted.fields.description).toMatchObject({ canonical: 'Updated English source.', state: 'missing' });
    expect(reverted.fields.description.translation).toBeUndefined();
    expect(marker.markNow).toHaveBeenCalledExactlyOnceWith(`product:${context.productId}`);
  });

  test('gets and updates Range and Variant translation fields', async ({ context }) => {
    const marker = { mark: vi.fn(), markNow: vi.fn() };
    const caller = context.createCaller(undefined, { catalogTranslationScheduler: marker });

    const range = await caller.catalogTranslations.updateRange({
      fields: { name: { isManual: true, value: 'My reeks' } },
      id: context.rangeId,
    });
    expect(range.fields.name).toMatchObject({
      canonical: 'Trailers',
      state: 'fresh',
      translation: { isManual: true, value: 'My reeks' },
    });
    await expect(caller.catalogTranslations.getRange({ id: context.rangeId })).resolves.toEqual(range);

    const withVariant = await caller.catalogTranslations.updateRange({
      id: context.rangeId,
      variants: [{ fields: { name: { isManual: true, value: 'My variant' } }, id: context.variantId }],
    });
    expect(withVariant.variants[0]?.fields.name).toMatchObject({
      canonical: 'Heavy Duty',
      state: 'fresh',
      translation: { isManual: true, value: 'My variant' },
    });
    await expect(caller.catalogTranslations.getRange({ id: context.rangeId })).resolves.toEqual(withVariant);
    expect(marker.markNow).not.toHaveBeenCalled();

    await caller.catalogTranslations.updateRange({
      fields: { name: { isManual: false } },
      id: context.rangeId,
      variants: [{ fields: { name: { isManual: false } }, id: context.variantId }],
    });
    expect(marker.markNow).toHaveBeenCalledWith(`product_range:${context.rangeId}`);
    expect(marker.markNow).toHaveBeenCalledWith(`product_range_variant:${context.variantId}`);
  });

  test('uses Product and Product Range edit permissions for translation procedures', async ({ context }) => {
    const productEditor = context.createCaller(mockSession('procurement-manager'));
    await expect(productEditor.catalogTranslations.getProduct({ id: context.productId })).resolves.toBeDefined();
    await expect(
      productEditor.catalogTranslations.updateProduct({
        fields: { name: { isManual: true, value: 'My produk' } },
        id: context.productId,
      }),
    ).resolves.toBeDefined();
    await expect(productEditor.catalogTranslations.getRange({ id: context.rangeId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      productEditor.catalogTranslations.updateRange({
        id: context.rangeId,
        variants: [{ fields: { name: { isManual: true, value: 'My variant' } }, id: context.variantId }],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('maps missing translation targets to stable entity error codes', async ({ context }) => {
    const caller = context.createCaller();
    const missingId = '00000000-0000-4000-8000-000000000099';

    await expect(caller.catalogTranslations.getProduct({ id: missingId })).rejects.toMatchObject({
      appCode: 'product.not_found',
      code: 'NOT_FOUND',
    });
    await expect(caller.catalogTranslations.getRange({ id: missingId })).rejects.toMatchObject({
      appCode: 'product_range.not_found',
      code: 'NOT_FOUND',
    });
  });
});
