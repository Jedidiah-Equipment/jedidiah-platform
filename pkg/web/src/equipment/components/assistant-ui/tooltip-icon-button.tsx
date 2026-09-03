import type { ComponentPropsWithRef, ReactNode } from 'react';

import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { cn } from '@/lib/utils.js';

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
};

export function TooltipIconButton({
  children,
  className,
  side = 'bottom',
  tooltip,
  ...props
}: TooltipIconButtonProps): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button className={cn('aui-button-icon', className)} size="icon-sm" variant="ghost" {...props}>
            {children}
            <span className="sr-only">{tooltip}</span>
          </Button>
        }
      />
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
