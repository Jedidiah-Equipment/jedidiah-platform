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
    <div className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm">
      <div className="text-muted-foreground">
        {loadedCount} of {totalLabel(total)}
      </div>
      {hasNextPage && onLoadMore ? (
        <Button disabled={isFetchingNextPage} onClick={onLoadMore} size="sm" variant="link">
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}
