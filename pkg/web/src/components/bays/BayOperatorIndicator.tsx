import type { BayOperator } from '@pkg/schema';
import { IconUserOff } from '@tabler/icons-react';
import type React from 'react';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { cn } from '@/lib/utils.js';

type BayOperatorIndicatorProps = {
  className?: string;
  operator: BayOperator | null;
  size?: 'default' | 'sm';
};

export const BayOperatorIndicator: React.FC<BayOperatorIndicatorProps> = ({
  className,
  operator,
  size = 'default',
}) => {
  const emptyClassName = size === 'sm' ? 'size-6' : 'size-8';
  const iconClassName = size === 'sm' ? 'size-3.5' : 'size-4';

  if (!operator) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              aria-label="No Operator assigned"
              className={cn(
                'flex shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground',
                emptyClassName,
                className,
              )}
              type="button"
            />
          }
        >
          <IconUserOff className={iconClassName} />
        </TooltipTrigger>
        <TooltipContent>No Operator assigned</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={`Current Operator: ${operator.name}`}
            className={cn('flex shrink-0 rounded-md', className)}
            type="button"
          />
        }
      >
        <EntityThumbnail
          label={operator.name}
          size={size === 'sm' ? 'sm' : 'default'}
          thumbnailDataUrl={operator.thumbnailDataUrl}
        />
      </TooltipTrigger>
      <TooltipContent>{operator.name}</TooltipContent>
    </Tooltip>
  );
};
