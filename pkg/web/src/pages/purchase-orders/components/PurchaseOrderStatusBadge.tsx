import type { PurchaseOrderDerivedStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';

const statusBadges = {
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  'closed-short': { label: 'Closed short', variant: 'secondary' },
  draft: { label: 'Draft', variant: 'secondary' },
  'partially-received': { label: 'Partially received', variant: 'default' },
  received: { label: 'Received', variant: 'default' },
  sent: { label: 'Sent', variant: 'default' },
} as const satisfies Record<
  PurchaseOrderDerivedStatus,
  { label: string; variant: 'default' | 'destructive' | 'secondary' }
>;

type PurchaseOrderStatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  status: PurchaseOrderDerivedStatus;
};

export function PurchaseOrderStatusBadge({ status, ...props }: PurchaseOrderStatusBadgeProps) {
  const badge = statusBadges[status];

  return (
    <Badge variant={badge.variant} {...props}>
      {badge.label}
    </Badge>
  );
}
