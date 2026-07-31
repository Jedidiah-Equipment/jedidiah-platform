import type React from 'react';

import { Button } from '@/components/ui/button.js';

type DataTableLoadMoreProps = {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  loadedCount: number;
  onLoadMore?: (() => void) | undefined;
  total: number;
  totalLabel: (total: number) => React.ReactNode;
};

export function DataTableLoadMore({
  hasNextPage = false,
  isFetchingNextPage = false,
  loadedCount,
  onLoadMore,
  total,
  totalLabel,
}: DataTableLoadMoreProps) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-sm">
      <div className="text-muted-foreground">
        {loadedCount} of {totalLabel(total)}
      </div>
      {hasNextPage && onLoadMore ? (
        <Button disabled={isFetchingNextPage} onClick={onLoadMore} size="sm" variant="outline">
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}
