import type * as React from 'react';

import { cn } from '@/lib/utils';

export type ReadOnlyFieldProps = {
  className?: string;
  label: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
};

export function ReadOnlyField({ className, label, value, valueClassName }: ReadOnlyFieldProps) {
  return (
    <div className={cn('grid gap-1.5 text-sm font-medium', className)}>
      <span>{label}</span>
      <div
        className={cn(
          'flex h-8 min-w-0 items-center rounded-lg border border-input bg-muted/40 px-2.5 py-1 font-normal text-foreground',
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
}
