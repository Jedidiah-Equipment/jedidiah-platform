import { formatNumber } from '@pkg/domain';
import type React from 'react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

/** A quick filter above a Job list: its label, its count, and an optional attention icon after the count. */
export function QuickFilterButton({
  count,
  pressed,
  onClick,
  attention,
  children,
}: {
  count: number;
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
      <span className="rounded bg-muted px-1 text-xs text-muted-foreground">{formatNumber(count)}</span>
      {attention}
    </Button>
  );
}
