import { formatNumber } from '@pkg/domain';
import type React from 'react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

/** One chip in a quick-filter bar: pressed while its pick is the current filter, with its count beside the label. */
export function QuickFilterButton({
  count,
  pressed,
  onClick,
  attention,
  children,
}: {
  count?: number | undefined;
  pressed: boolean;
  onClick: () => void;
  attention?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Button
      aria-pressed={pressed}
      className={cn('h-9 gap-1.5 px-2', pressed && 'border-muted-foreground/60 bg-muted text-foreground')}
      onClick={onClick}
      size="sm"
      type="button"
      variant="outline"
    >
      {children}
      {count === undefined ? null : (
        <span className="rounded bg-muted px-1 text-xs text-muted-foreground">{formatNumber(count)}</span>
      )}
      {attention}
    </Button>
  );
}
