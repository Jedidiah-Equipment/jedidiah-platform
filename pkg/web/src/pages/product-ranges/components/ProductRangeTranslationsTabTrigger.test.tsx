import type { CatalogProductRangeTranslation, CatalogProductRangeVariantTranslation } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Tabs, TabsList } from '@/components/ui/tabs.js';
import {
  ProductRangeTranslationsTabTriggerContent,
  productRangeTranslationNeedsAttention,
} from './ProductRangeTranslationsTabTrigger.js';

describe('ProductRangeTranslationsTabTrigger', () => {
  it('shows attention when a Range or one of its Variants needs translation work', () => {
    const range = buildRangeTranslation('fresh');
    const variants = [buildVariantTranslation('needsReview')];

    expect(productRangeTranslationNeedsAttention(range, variants)).toBe(true);
    expect(renderTrigger(range, variants)).toContain('Afrikaans translations need attention');
  });

  it('does not show attention when every Range and Variant field is fresh', () => {
    const range = buildRangeTranslation('fresh');
    const variants = [buildVariantTranslation('fresh')];

    expect(productRangeTranslationNeedsAttention(range, variants)).toBe(false);
    expect(renderTrigger(range, variants)).not.toContain('Afrikaans translations need attention');
  });
});

function renderTrigger(
  range: CatalogProductRangeTranslation,
  variants: CatalogProductRangeVariantTranslation[],
): string {
  return renderToStaticMarkup(
    <Tabs value="translations">
      <TabsList>
        <ProductRangeTranslationsTabTriggerContent range={range} variants={variants} />
      </TabsList>
    </Tabs>,
  );
}

function buildRangeTranslation(state: 'fresh' | 'needsReview'): CatalogProductRangeTranslation {
  return {
    fields: {
      description: stringField('Built for harvest', 'Gebou vir oes', state),
      name: stringField('Harvest Range', 'Oesreeks', state),
    },
    id: '123e4567-e89b-42d3-a456-426614174000',
  };
}

function buildVariantTranslation(state: 'fresh' | 'needsReview'): CatalogProductRangeVariantTranslation {
  return {
    fields: { name: stringField('Heavy Duty', 'Swaardiens', state) },
    id: '123e4567-e89b-42d3-a456-426614174001',
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
