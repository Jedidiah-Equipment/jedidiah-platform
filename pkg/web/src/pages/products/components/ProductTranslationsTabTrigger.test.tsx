import type { CatalogProductTranslation } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Tabs, TabsList } from '@/components/ui/tabs.js';
import {
  ProductTranslationsTabTriggerContent,
  productTranslationNeedsAttention,
} from './ProductTranslationsTabTrigger.js';

describe('ProductTranslationsTabTrigger', () => {
  it('shows the existing tab-attention dot when any Product translation field needs review', () => {
    const translation = buildTranslation('needsReview');

    expect(productTranslationNeedsAttention(translation)).toBe(true);
    expect(renderTrigger(translation)).toContain('Afrikaans translations need attention');
  });

  it('does not show attention when every Product and Assembly field is fresh', () => {
    const translation = buildTranslation('fresh');

    expect(productTranslationNeedsAttention(translation)).toBe(false);
    expect(renderTrigger(translation)).not.toContain('Afrikaans translations need attention');
  });
});

function renderTrigger(translation: CatalogProductTranslation): string {
  return renderToStaticMarkup(
    <Tabs value="translations">
      <TabsList>
        <ProductTranslationsTabTriggerContent translation={translation} />
      </TabsList>
    </Tabs>,
  );
}

function buildTranslation(state: 'fresh' | 'needsReview'): CatalogProductTranslation {
  const stringField = (canonical: string, value: string) => ({
    canonical,
    state,
    translation: {
      isManual: state === 'needsReview',
      sourceHash: 'source-hash',
      translatedAt: '2026-07-14T12:00:00.000Z',
      value,
    },
  });

  return {
    assemblies: [
      {
        fields: { name: stringField('Tailgate', 'Agterklap') },
        id: '123e4567-e89b-42d3-a456-426614174001',
      },
    ],
    fields: {
      category: stringField('Silage', 'Kuilvoer'),
      description: stringField('Built for harvest', 'Gebou vir oes'),
      keyFeatures: {
        canonical: ['High capacity'],
        state,
        translation: {
          isManual: state === 'needsReview',
          sourceHash: 'source-hash',
          translatedAt: '2026-07-14T12:00:00.000Z',
          value: ['Hoe kapasiteit'],
        },
      },
      name: stringField('Trailer', 'Sleepwa'),
      nameHighlight: {
        canonical: null,
        state,
        translation: {
          isManual: state === 'needsReview',
          sourceHash: 'source-hash',
          translatedAt: '2026-07-14T12:00:00.000Z',
          value: null,
        },
      },
      technicalDetails: {
        canonical: [{ label: 'Capacity', value: '42 m3' }],
        state,
        translation: {
          isManual: state === 'needsReview',
          sourceHash: 'source-hash',
          translatedAt: '2026-07-14T12:00:00.000Z',
          value: [{ label: 'Kapasiteit', value: '42 m3' }],
        },
      },
    },
    id: '123e4567-e89b-42d3-a456-426614174000',
  };
}
