import type { CatalogProductRangeTranslation, CatalogProductRangeVariantTranslation } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useAppForm } from '@/components/form/index.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorToast: () => vi.fn(),
}));

import { ProductRangeTranslationFields } from './ProductRangeTranslationsEditor.js';
import {
  getProductRangeTranslationManualFields,
  type ProductRangeTranslationBundle,
  toProductRangeTranslationFormValues,
} from './product-range-translations/types.js';

describe('ProductRangeTranslationFields', () => {
  it('renders Range fields and every Variant name with English beside Afrikaans', () => {
    const translation = buildBundle();
    const html = renderToStaticMarkup(<ProductRangeTranslationFieldsHarness translation={translation} />);

    expect(html).toContain('Range translations');
    expect(html).toContain('Harvest Range');
    expect(html).toContain('Oesreeks');
    expect(html).toContain('Built for harvest');
    expect(html).toContain('Gebou vir oes');
    expect(html).toContain('Variant translations');
    expect(html).toContain('Heavy Duty');
    expect(html).toContain('Swaardiens');
    expect(html).toContain('Compact');
    expect(html).toContain('Kompak');
    expect(html.match(/>English</g)).toHaveLength(4);
    expect(html.match(/>Afrikaans</g)).toHaveLength(4);
  });
});

const ProductRangeTranslationFieldsHarness: React.FC<{ translation: ProductRangeTranslationBundle }> = ({
  translation,
}) => {
  const form = useAppForm({
    defaultValues: toProductRangeTranslationFormValues(translation),
    onSubmit: () => undefined,
  });

  return (
    <form.AppForm>
      <ProductRangeTranslationFields
        isTogglePending={false}
        manual={getProductRangeTranslationManualFields(translation)}
        onEnable={vi.fn()}
        onInteract={vi.fn()}
        onRequestRevert={vi.fn()}
        translation={translation}
      />
    </form.AppForm>
  );
};

function buildBundle(): ProductRangeTranslationBundle {
  const field = (canonical: string, value: string, isManual: boolean) => ({
    canonical,
    state: 'fresh' as const,
    translation: {
      isManual,
      sourceHash: 'source-hash',
      translatedAt: '2026-07-14T12:00:00.000Z',
      value,
    },
  });
  const range = {
    fields: {
      description: field('Built for harvest', 'Gebou vir oes', true),
      name: field('Harvest Range', 'Oesreeks', false),
    },
    id: '123e4567-e89b-42d3-a456-426614174000',
  } satisfies CatalogProductRangeTranslation;
  const variants = [
    {
      fields: { name: field('Heavy Duty', 'Swaardiens', true) },
      id: '123e4567-e89b-42d3-a456-426614174001',
    },
    {
      fields: { name: field('Compact', 'Kompak', false) },
      id: '123e4567-e89b-42d3-a456-426614174002',
    },
  ] satisfies CatalogProductRangeVariantTranslation[];

  return { range, variants };
}
