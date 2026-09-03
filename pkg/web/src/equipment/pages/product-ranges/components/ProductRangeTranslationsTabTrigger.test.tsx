import type { CatalogProductRangeTranslation } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Tabs, TabsList } from '@/components/ui/tabs.js';
import {
  ProductRangeTranslationsTabTriggerContent,
  productRangeTranslationNeedsAttention,
} from './ProductRangeTranslationsTabTrigger.js';

describe('ProductRangeTranslationsTabTrigger', () => {
  it('shows attention when one of the Range Variants needs translation work', () => {
    const translation = buildTranslation('fresh', 'needsReview');

    expect(productRangeTranslationNeedsAttention(translation)).toBe(true);
    expect(renderTrigger(translation)).toContain('Afrikaans translations need attention');
  });

  it('shows attention when a Range field itself needs translation work', () => {
    const translation = buildTranslation('needsReview', 'fresh');

    expect(productRangeTranslationNeedsAttention(translation)).toBe(true);
    expect(renderTrigger(translation)).toContain('Afrikaans translations need attention');
  });

  it('does not show attention when every Range and Variant field is fresh', () => {
    const translation = buildTranslation('fresh', 'fresh');

    expect(productRangeTranslationNeedsAttention(translation)).toBe(false);
    expect(renderTrigger(translation)).not.toContain('Afrikaans translations need attention');
  });
});

function renderTrigger(translation: CatalogProductRangeTranslation): string {
  return renderToStaticMarkup(
    <Tabs value="translations">
      <TabsList>
        <ProductRangeTranslationsTabTriggerContent translation={translation} />
      </TabsList>
    </Tabs>,
  );
}

function buildTranslation(
  rangeState: 'fresh' | 'needsReview',
  variantState: 'fresh' | 'needsReview',
): CatalogProductRangeTranslation {
  return {
    fields: {
      description: stringField('Built for harvest', 'Gebou vir oes', rangeState),
      name: stringField('Harvest Range', 'Oesreeks', rangeState),
    },
    id: '123e4567-e89b-42d3-a456-426614174000',
    variants: [
      {
        fields: { name: stringField('Heavy Duty', 'Swaardiens', variantState) },
        id: '123e4567-e89b-42d3-a456-426614174001',
      },
    ],
  };
}

function stringField(canonical: string, value: string, state: 'fresh' | 'needsReview') {
  return {
    canonical,
    state,
    translation: {
      isManual: state === 'needsReview',
      sourceHash: 'source-hash',
      translatedAt: '2026-07-14T12:00:00.000Z',
      value,
    },
  };
}
