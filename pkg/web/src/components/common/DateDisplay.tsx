import { type DateFormat, getDateDisplayParts } from '@pkg/domain';
import type React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { cn } from '@/lib/utils.js';

export type DateDisplayProps = Omit<React.ComponentPropsWithoutRef<'span'>, 'children'> & {
  date?: Date | string | number | null;
  emptyValue?: string | undefined;
  format?: DateFormat;
};

export const DateDisplay: React.FC<DateDisplayProps> = ({
  className,
  date,
  emptyValue,
  format = 'short',
  ...props
}) => {
  const display = getDateDisplayParts({ date, emptyValue, format });

  if (!display.tooltip) {
    return (
      <span className={className} {...props}>
        {display.label}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn('cursor-help decoration-dotted underline-offset-2 hover:underline', className)}
            {...props}
          >
            {display.label}
          </span>
        }
      />
      <TooltipContent>{display.tooltip}</TooltipContent>
    </Tooltip>
  );
};
