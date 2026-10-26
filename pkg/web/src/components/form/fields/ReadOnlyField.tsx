import type * as React from 'react';

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group.js';
import { cn } from '@/lib/utils';

export type ReadOnlyFieldProps = {
  className?: string;
  label: React.ReactNode;
  valueClassName?: string;
} & (
  | { unit?: undefined; value: React.ReactNode }
  /** A unit shown inside the box on the right, drawn as `NumberField` draws its `unit`. */
  | { unit: string; value: string | null }
);

export function ReadOnlyField({ className, label, unit, value, valueClassName }: ReadOnlyFieldProps) {
  return (
    <div className={cn('grid gap-1.5 text-sm font-medium', className)}>
      <span>{label}</span>
      {unit === undefined ? (
        <div
          className={cn(
            'flex h-8 min-w-0 items-center rounded-lg border border-input bg-muted/40 px-2.5 py-1 font-normal text-foreground',
            valueClassName,
          )}
        >
          {value}
        </div>
      ) : (
        <InputGroup className={cn('bg-muted/40', valueClassName)}>
          <InputGroupInput readOnly tabIndex={-1} value={value ?? ''} />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{unit}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      )}
    </div>
  );
}
