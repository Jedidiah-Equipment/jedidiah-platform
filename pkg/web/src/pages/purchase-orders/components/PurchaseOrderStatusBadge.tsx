import type { PurchaseOrderDerivedStatus } from '@pkg/schema';

import { Badge } from '@/components/ui/badge.js';

const statusLabels = {
  cancelled: 'Cancelled',
  'closed-short': 'Closed short',
  draft: 'Draft',
  'partially-received': 'Partially received',
  received: 'Received',
  sent: 'Sent',
} as const satisfies Record<PurchaseOrderDerivedStatus, string>;

const statusVariants = {
  cancelled: 'destructive',
  'closed-short': 'secondary',
  draft: 'secondary',
  'partially-received': 'default',
  received: 'default',
  sent: 'default',
} as const satisfies Record<PurchaseOrderDerivedStatus, 'default' | 'destructive' | 'secondary'>;

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderDerivedStatus }) {
  return <Badge variant={statusVariants[status]}>{statusLabels[status]}</Badge>;
}
