import type { CatalogProductTranslation, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { TabsTrigger } from '@/components/ui/tabs.js';
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
  const needsAttention = translation ? productTranslationNeedsAttention(translation) : false;

  return (
    <TabsTrigger value="translations">
      <span>Translations</span>
      {needsAttention ? (
        <>
          <span aria-hidden className="size-2 rounded-full bg-orange-400" />
          <span className="sr-only">Afrikaans translations need attention</span>
        </>
      ) : null}
    </TabsTrigger>
  );
}

export function productTranslationNeedsAttention(translation: CatalogProductTranslation): boolean {
  return (
    Object.values(translation.fields).some((field) => field.state !== 'fresh') ||
    translation.assemblies.some((assembly) => assembly.fields.name.state !== 'fresh')
  );
}
