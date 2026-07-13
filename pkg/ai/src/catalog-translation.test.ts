import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { translateCatalogSourceToAfrikaans } from './catalog-translation.js';

const ASSEMBLY_ID = '00000000-0000-4000-8000-000000000001';

function generatedJson(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    },
    warnings: [],
  };
}

describe('Afrikaans catalog translation', () => {
  test('translates one product bundle with its ordered arrays and assemblies', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () =>
        generatedJson({
          name: 'Kuilvoer-sleepwa',
          nameHighlight: 'XL',
          category: 'Kuilvoer en graan',
          description: 'Gebou vir veeleisende oeste.',
          keyFeatures: ['Hoë kapasiteit'],
          technicalDetails: [{ label: 'Kapasiteit', value: '42 m³' }],
          assemblies: [{ id: ASSEMBLY_ID, name: 'Hidrouliese agterklap' }],
        }),
    });

    const translated = await translateCatalogSourceToAfrikaans({
      kind: 'product',
      model,
      source: {
        name: 'Silage Trailer',
        nameHighlight: 'XL',
        category: 'Silage and grain',
        description: 'Built for demanding harvests.',
        keyFeatures: ['High capacity'],
        technicalDetails: [{ label: 'Capacity', value: '42 m³' }],
        assemblies: [{ id: ASSEMBLY_ID, name: 'Hydraulic tailgate' }],
      },
    });

    expect(translated).toMatchObject({
      name: 'Kuilvoer-sleepwa',
      keyFeatures: ['Hoë kapasiteit'],
      technicalDetails: [{ label: 'Kapasiteit', value: '42 m³' }],
      assemblies: [{ id: ASSEMBLY_ID, name: 'Hidrouliese agterklap' }],
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
      'professional South African agricultural-equipment',
    );
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
      'model codes, brand names, numbers, units, and dimensions',
    );
  });

  test('retries product output whose arrays or assembly ids drift', async () => {
    let call = 0;
    const valid = {
      name: 'Sleepwa',
      nameHighlight: null,
      category: null,
      description: null,
      keyFeatures: ['Sterk'],
      technicalDetails: [],
      assemblies: [{ id: ASSEMBLY_ID, name: 'Raam' }],
    };
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        call += 1;
        return generatedJson(
          call === 1
            ? { ...valid, keyFeatures: [], assemblies: [{ ...valid.assemblies[0], id: crypto.randomUUID() }] }
            : valid,
        );
      },
    });

    await expect(
      translateCatalogSourceToAfrikaans({
        kind: 'product',
        model,
        source: {
          name: 'Trailer',
          nameHighlight: null,
          category: null,
          description: null,
          keyFeatures: ['Strong'],
          technicalDetails: [],
          assemblies: [{ id: ASSEMBLY_ID, name: 'Frame' }],
        },
      }),
    ).resolves.toMatchObject(valid);
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  test('translates ranges and variants with their own schemas', async () => {
    const rangeModel = new MockLanguageModelV3({
      doGenerate: async () => generatedJson({ name: 'Kuilvoerwaens', description: 'Waens vir die oes.' }),
    });
    const variantModel = new MockLanguageModelV3({
      doGenerate: async () => generatedJson({ name: 'Swaardiens' }),
    });

    await expect(
      translateCatalogSourceToAfrikaans({
        kind: 'range',
        model: rangeModel,
        source: { name: 'Silage Trailers', description: 'Trailers for harvest.' },
      }),
    ).resolves.toEqual({ name: 'Kuilvoerwaens', description: 'Waens vir die oes.' });
    await expect(
      translateCatalogSourceToAfrikaans({ kind: 'variant', model: variantModel, source: { name: 'Heavy Duty' } }),
    ).resolves.toEqual({ name: 'Swaardiens' });
  });
});
