import type { CatalogTranslationNeedsReviewItem } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import {
  PRODUCT_RANGE_TRANSLATION_FIELD_LABELS,
  PRODUCT_RANGE_VARIANT_TRANSLATION_FIELD_LABELS,
  PRODUCT_TRANSLATION_FIELD_LABELS,
} from '@/components/catalog-translations/catalog-translation-labels.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { useTRPC } from '@/lib/trpc.js';

export const CatalogTranslationNeedsReview: React.FC = () => {
  const trpc = useTRPC();
  const needsReviewQuery = useQuery(trpc.catalogTranslations.listNeedsReview.queryOptions());

  return (
    <CatalogTranslationNeedsReviewContent
      hasError={Boolean(needsReviewQuery.error)}
      isLoading={needsReviewQuery.isLoading}
      items={needsReviewQuery.data ?? []}
    />
  );
};

type CatalogTranslationNeedsReviewContentProps = {
  hasError: boolean;
  isLoading: boolean;
  items: CatalogTranslationNeedsReviewItem[];
};

export const CatalogTranslationNeedsReviewContent: React.FC<CatalogTranslationNeedsReviewContentProps> = ({
  hasError,
  isLoading,
  items,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Needs review</CardTitle>
      <CardDescription>Manual Afrikaans translations whose English source has changed.</CardDescription>
    </CardHeader>
    <CardContent>
      {hasError ? (
        <div className="rounded-lg border border-destructive/40 p-4 text-destructive text-sm">
          Unable to load translations needing review.
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-2" role="status">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <span className="sr-only">Loading translations needing review</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No Afrikaans translations need review.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entity kind</TableHead>
              <TableHead>Entity name</TableHead>
              <TableHead>Affected fields</TableHead>
              <TableHead>
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.kind}:${item.id}`}>
                <TableCell>{ENTITY_KIND_LABELS[item.kind]}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {affectedFieldLabels(item).join(', ')}
                </TableCell>
                <TableCell className="text-right">
                  <Button render={<NeedsReviewLink item={item} />} size="sm" variant="outline">
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);

const ENTITY_KIND_LABELS = {
  product: 'Product',
  range: 'Range',
  variant: 'Variant',
} satisfies Record<CatalogTranslationNeedsReviewItem['kind'], string>;

// A Variant's translations live on its Range's Translations tab, so triage links there.
function NeedsReviewLink({ item }: { item: CatalogTranslationNeedsReviewItem }) {
  const search = { tab: 'translations' } as const;
  return item.kind === 'product' ? (
    <Link params={{ id: item.id }} search={search} to="/products/$id/edit" />
  ) : (
    <Link
      params={{ id: item.kind === 'range' ? item.id : item.rangeId }}
      search={search}
      to="/product-ranges/$id/edit"
    />
  );
}

function affectedFieldLabels(item: CatalogTranslationNeedsReviewItem): string[] {
  if (item.kind === 'product') {
    return item.affectedFields.map((field) =>
      field.kind === 'assembly' ? `Assembly: ${field.name}` : PRODUCT_TRANSLATION_FIELD_LABELS[field.field],
    );
  }
  if (item.kind === 'range') {
    return item.affectedFields.map(({ field }) => PRODUCT_RANGE_TRANSLATION_FIELD_LABELS[field]);
  }
  return item.affectedFields.map(({ field }) => PRODUCT_RANGE_VARIANT_TRANSLATION_FIELD_LABELS[field]);
}
