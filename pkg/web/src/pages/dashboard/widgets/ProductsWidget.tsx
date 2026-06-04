import { formatCurrency, hasPermission } from '@pkg/domain';
import type { Product, ProductListInput } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';

const PRODUCTS_WIDGET_LIST_INPUT = {
  columnFilters: {},
  page: 1,
  pageSize: 5,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} as const satisfies ProductListInput;

const PRODUCTS_WIDGET_SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export const ProductsWidget: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const productsQuery = useQuery(trpc.products.list.queryOptions(PRODUCTS_WIDGET_LIST_INPUT));
  const canUpdateProduct = hasPermission(accessQuery.data, 'product:update');
  const products = productsQuery.data?.items ?? [];

  if (productsQuery.error) {
    return <DashboardWidgetError error={productsQuery.error} fallbackMessage="Unable to load products." />;
  }

  if (productsQuery.isPending) {
    return <ProductsWidgetSkeleton />;
  }

  if (!productsQuery.data || productsQuery.data.total === 0) {
    return <DashboardWidgetEmpty>No products yet.</DashboardWidgetEmpty>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-semibold text-3xl tabular-nums">{productsQuery.data.total}</p>
        <p className="text-muted-foreground text-sm">Total products</p>
      </div>
      <ul className="flex flex-col divide-y">
        {products.map((product) => (
          <li key={product.id}>
            <ProductRow canUpdateProduct={canUpdateProduct} product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
};

function ProductRow({ canUpdateProduct, product }: { canUpdateProduct: boolean; product: Product }) {
  const content = <ProductRowContent canUpdateProduct={canUpdateProduct} product={product} />;
  const className = 'group grid min-w-0 grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 text-sm first:pt-0 last:pb-0';

  if (!canUpdateProduct) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link className={className} params={{ id: product.id }} to="/products/$id/edit">
      {content}
    </Link>
  );
}

function ProductRowContent({ canUpdateProduct, product }: { canUpdateProduct: boolean; product: Product }) {
  return (
    <>
      <span className="min-w-0">
        <span
          className={`block truncate font-medium text-foreground ${canUpdateProduct ? 'group-hover:underline' : ''}`}
        >
          {product.name}
        </span>
        <span className="block truncate text-muted-foreground">{product.modelCode}</span>
      </span>
      <span className="text-right">
        <span className="block font-medium tabular-nums">
          {formatCurrency(product.basePrice, product.currencyCode)}
        </span>
        <span className="block text-muted-foreground text-xs">{product.buildTimeDays}d build</span>
      </span>
    </>
  );
}

function ProductsWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col gap-3">
        {PRODUCTS_WIDGET_SKELETON_ROWS.map((row) => (
          <div key={row} className="grid grid-cols-[1fr_auto] gap-4">
            <span className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </span>
            <span className="flex flex-col items-end gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-14" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
