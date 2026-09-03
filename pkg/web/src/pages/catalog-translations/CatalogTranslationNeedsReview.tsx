import type { CatalogTranslationNeedsReviewItem } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import {
  PRODUCT_RANGE_TRANSLATION_FIELD_LABELS,
  PRODUCT_RANGE_VARIANT_TRANSLATION_FIELD_LABELS,
  PRODUCT_TRANSLATION_FIELD_LABELS,
} from '@/components/catalog-translations/catalog-translation-labels.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
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
}) => {
  const table = useDataTable({
    columns: needsReviewColumns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    getRowId: (item) => `${item.kind}:${item.id}`,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs review</CardTitle>
        <CardDescription>Manual Afrikaans translations whose English source has changed.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          emptyMessage="No Afrikaans translations need review."
          errorMessage={hasError ? 'Unable to load translations needing review.' : undefined}
          hideGlobalFilter
          isLoading={isLoading}
          paginationMode="complete"
          table={table}
          total={items.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'translation' : 'translations'}`}
        />
      </CardContent>
    </Card>
  );
};

const ENTITY_KIND_LABELS = {
  product: 'Product',
  range: 'Range',
  variant: 'Variant',
} satisfies Record<CatalogTranslationNeedsReviewItem['kind'], string>;

const needsReviewColumns: DataTableColumnDef<CatalogTranslationNeedsReviewItem>[] = [
  {
    accessorFn: (item) => ENTITY_KIND_LABELS[item.kind],
    header: 'Entity kind',
    id: 'kind',
  },
  {
    accessorKey: 'name',
    header: 'Entity name',
    meta: { cellClassName: 'font-medium' },
  },
  {
    accessorFn: (item) => affectedFieldLabels(item).join(', '),
    header: 'Affected fields',
    id: 'affectedFields',
    meta: { cellClassName: 'whitespace-normal text-muted-foreground' },
  },
  {
    cell: ({ row }) => <NeedsReviewButton item={row.original} />,
    enableGlobalFilter: false,
    enableSorting: false,
    header: () => <span className="sr-only">Action</span>,
    id: 'action',
    meta: { cellClassName: 'text-right' },
  },
];

// Button renders the link by cloning it with its own label and styling, so the Link has to be the direct
// render element. A Variant's translations live on its Range's Translations tab, so triage links there.
function NeedsReviewButton({ item }: { item: CatalogTranslationNeedsReviewItem }) {
  const search = { tab: 'translations' } as const;

  if (item.kind === 'product') {
    return (
      <Button
        render={<Link params={{ id: item.id }} search={search} to="/equipment/products/$id/edit" />}
        size="sm"
        variant="outline"
      >
        Review
      </Button>
    );
  }

  return (
    <Button
      render={
        <Link
          params={{ id: item.kind === 'range' ? item.id : item.rangeId }}
          search={search}
          to="/equipment/product-ranges/$id/edit"
        />
      }
      size="sm"
      variant="outline"
    >
      Review
    </Button>
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
