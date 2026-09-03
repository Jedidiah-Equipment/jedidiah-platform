import type { CatalogProductRangeTranslation, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { translationFieldsNeedAttention } from '@/components/catalog-translations/translation-attention.js';
import { AttentionTabTrigger } from '@/components/common/AttentionTabTrigger.js';
import { useTRPC } from '@/lib/trpc.js';

type ProductRangeTranslationsTabTriggerProps = {
  rangeId: UUID;
};

export const ProductRangeTranslationsTabTrigger: React.FC<ProductRangeTranslationsTabTriggerProps> = ({ rangeId }) => {
  const trpc = useTRPC();
  const rangeQuery = useQuery(trpc.catalogTranslations.getRange.queryOptions({ id: rangeId }));

  return <ProductRangeTranslationsTabTriggerContent translation={rangeQuery.data} />;
};

export function ProductRangeTranslationsTabTriggerContent({
  translation,
}: {
  translation: CatalogProductRangeTranslation | undefined;
}) {
  return (
    <AttentionTabTrigger
      attentionLabel="Afrikaans translations need attention"
      label="Translations"
      needsAttention={translation ? productRangeTranslationNeedsAttention(translation) : false}
      value="translations"
    />
  );
}

export function productRangeTranslationNeedsAttention(translation: CatalogProductRangeTranslation): boolean {
  return (
    translationFieldsNeedAttention(translation.fields) ||
    translation.variants.some((variant) => translationFieldsNeedAttention(variant.fields))
  );
}
