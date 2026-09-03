import type { PurchaseOrderDerivedStatus } from '@pkg/schema';

import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../../theme/status-badge.js';

export const purchaseOrderStatusLabels: Record<PurchaseOrderDerivedStatus, string> = {
  approved: 'Approved',
  cancelled: 'Cancelled',
  'closed-short': 'Closed short',
  draft: 'Draft',
  'partially-received': 'Partially received',
  received: 'Received',
};

/**
 * Tailwind classes split so native surfaces can put the text colour on the Text element, the same shape
 * `quoteStatusColorClassNames` uses. An order's status is a fact about where it sits in its life,
 * never a call to action, so none of these reach for the brand colour.
 */
export const purchaseOrderStatusColorClassNames: Record<PurchaseOrderDerivedStatus, BadgeColorClassNames> = {
  // Cleared to go, and not yet the green of stock that has actually landed.
  approved: statusBadgeColorClassNames.teal,
  cancelled: statusBadgeColorClassNames.red,
  // Ended deliberately with stock still outstanding — settled, so it reads as neutral as Draft.
  'closed-short': statusBadgeColorClassNames.gray,
  draft: statusBadgeColorClassNames.gray,
  'partially-received': statusBadgeColorClassNames.orange,
  received: statusBadgeColorClassNames.green,
};
