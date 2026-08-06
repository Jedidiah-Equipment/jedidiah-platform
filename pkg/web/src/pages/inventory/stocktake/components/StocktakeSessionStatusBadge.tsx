import { stocktakeSessionStatusColorClassNames, stocktakeSessionStatusLabels } from '@pkg/domain';
import type { StocktakeSessionStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type StocktakeSessionStatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  /** `default` for list rows, `lg` for a page header. */
  size?: React.ComponentProps<typeof Badge>['size'];
  status: StocktakeSessionStatus;
};

/** The one badge every stocktake session status renders through, on every surface. */
export const StocktakeSessionStatusBadge: React.FC<StocktakeSessionStatusBadgeProps> = ({
  className,
  size = 'default',
  status,
  ...props
}) => (
  <Badge
    className={cn(
      stocktakeSessionStatusColorClassNames[status].chip,
      stocktakeSessionStatusColorClassNames[status].text,
      className,
    )}
    size={size}
    variant="outline"
    {...props}
  >
    {stocktakeSessionStatusLabels[status]}
  </Badge>
);
