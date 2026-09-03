import { purchaseOrderStatusColorClassNames, purchaseOrderStatusLabels } from '@pkg/domain';
import type { PurchaseOrderDerivedStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type PurchaseOrderStatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  /** `default` for list rows and cards, `lg` for a page header. */
  size?: React.ComponentProps<typeof Badge>['size'];
  status: PurchaseOrderDerivedStatus;
};

/** The one badge every Purchase Order status renders through, on every surface. */
export const PurchaseOrderStatusBadge: React.FC<PurchaseOrderStatusBadgeProps> = ({
  className,
  size = 'default',
  status,
  ...props
}) => (
  <Badge
    className={cn(
      purchaseOrderStatusColorClassNames[status].chip,
      purchaseOrderStatusColorClassNames[status].text,
      className,
    )}
    size={size}
    variant="outline"
    {...props}
  >
    {purchaseOrderStatusLabels[status]}
  </Badge>
);
