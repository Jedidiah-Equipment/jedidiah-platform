import type { CatalogProductTranslation, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { translationFieldsNeedAttention } from '@/components/catalog-translations/translation-attention.js';
import { AttentionTabTrigger } from '@/components/common/AttentionTabTrigger.js';
import { useTRPC } from '@/lib/trpc.js';

type ProductTranslationsTabTriggerProps = {
  productId: UUID;
};

export const ProductTranslationsTabTrigger: React.FC<ProductTranslationsTabTriggerProps> = ({ productId }) => {
  const trpc = useTRPC();
  const translationQuery = useQuery(trpc.catalogTranslations.getProduct.queryOptions({ id: productId }));

  return <ProductTranslationsTabTriggerContent translation={translationQuery.data} />;
};

export function ProductTranslationsTabTriggerContent({
  translation,
}: {
  translation: CatalogProductTranslation | undefined;
}) {
  return (
    <AttentionTabTrigger
      attentionLabel="Afrikaans translations need attention"
      label="Translations"
      needsAttention={translation ? productTranslationNeedsAttention(translation) : false}
      value="translations"
    />
  );
}

export function productTranslationNeedsAttention(translation: CatalogProductTranslation): boolean {
  return (
    translationFieldsNeedAttention(translation.fields) ||
    translation.assemblies.some((assembly) => translationFieldsNeedAttention(assembly.fields))
  );
}
