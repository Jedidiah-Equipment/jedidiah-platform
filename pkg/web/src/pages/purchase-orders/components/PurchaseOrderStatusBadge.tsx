import type { PurchaseOrderDerivedStatus } from '@pkg/schema';

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

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderDerivedStatus }) {
  const badge = statusBadges[status];

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
