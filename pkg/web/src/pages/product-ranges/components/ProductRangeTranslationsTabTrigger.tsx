import type { CatalogProductRangeTranslation, CatalogProductRangeVariantTranslation, UUID } from '@pkg/schema';
import { useQueries, useQuery } from '@tanstack/react-query';
import type React from 'react';

import { TabsTrigger } from '@/components/ui/tabs.js';
import { useTRPC } from '@/lib/trpc.js';

type ProductRangeTranslationsTabTriggerProps = {
  rangeId: UUID;
  variantIds: UUID[];
};

export const ProductRangeTranslationsTabTrigger: React.FC<ProductRangeTranslationsTabTriggerProps> = ({
  rangeId,
  variantIds,
}) => {
  const trpc = useTRPC();
  const rangeQuery = useQuery(trpc.catalogTranslations.getRange.queryOptions({ id: rangeId }));
  const variantQueries = useQueries({
    queries: variantIds.map((id) => trpc.catalogTranslations.getVariant.queryOptions({ id })),
  });

  return (
    <ProductRangeTranslationsTabTriggerContent
      range={rangeQuery.data}
      variants={variantQueries.flatMap((query) => (query.data ? [query.data] : []))}
    />
  );
};

export function ProductRangeTranslationsTabTriggerContent({
  range,
  variants,
}: {
  range: CatalogProductRangeTranslation | undefined;
  variants: CatalogProductRangeVariantTranslation[];
}) {
  const needsAttention = range ? productRangeTranslationNeedsAttention(range, variants) : false;

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

export function productRangeTranslationNeedsAttention(
  range: CatalogProductRangeTranslation,
  variants: CatalogProductRangeVariantTranslation[],
): boolean {
  return (
    Object.values(range.fields).some((field) => field.state !== 'fresh') ||
    variants.some((variant) => variant.fields.name.state !== 'fresh')
  );
}
