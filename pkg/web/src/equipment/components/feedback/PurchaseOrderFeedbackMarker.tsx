import type { FeedbackPurchaseOrder } from '@pkg/schema/equipment';
import { IconShoppingCart } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

const className =
  'relative z-10 inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200';

/** The PO a piece of feedback was given about, linked to the order for a reader who may open it. */
export function PurchaseOrderFeedbackMarker({
  canRead,
  purchaseOrder,
}: {
  canRead: boolean;
  purchaseOrder: FeedbackPurchaseOrder;
}) {
  const content = (
    <>
      <IconShoppingCart aria-hidden className="size-3.5" />
      {purchaseOrder.code} · {purchaseOrder.supplierName}
    </>
  );
  return canRead ? (
    <Link className={className} params={{ id: purchaseOrder.id }} to="/equipment/purchase-orders/$id">
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
}
