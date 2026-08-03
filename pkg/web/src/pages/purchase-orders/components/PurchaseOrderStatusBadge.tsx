import type { PurchaseOrderStatus } from '@pkg/schema';

import { Badge } from '@/components/ui/badge.js';

const statusLabels = {
  cancelled: 'Cancelled',
  draft: 'Draft',
  sent: 'Sent',
} as const satisfies Record<PurchaseOrderStatus, string>;

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const variant = status === 'cancelled' ? 'destructive' : status === 'sent' ? 'default' : 'secondary';

  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}
