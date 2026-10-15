import type { PurchaseOrderView } from '@pkg/schema/equipment';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { PurchaseOrderReceivingLines } from './PurchaseOrderReceivingLines.js';

/**
 * The dock's view of a sent order: what each line still owes, and the one action that posts it.
 * A refused-at-dock delivery is simply not received — nothing here records it.
 */
export function PurchaseOrderReceivingCard({
  canReadCosts,
  purchaseOrder,
}: {
  canReadCosts: boolean;
  purchaseOrder: PurchaseOrderView;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Receiving</CardTitle>
        <CardDescription>
          Confirm what arrived at the dock. The Purchase Order price is used unless an authorized receiver overrides it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PurchaseOrderReceivingLines
          canReadCosts={canReadCosts}
          canReceive
          lines={purchaseOrder.lines}
          purchaseOrder={purchaseOrder}
        />
      </CardContent>
    </Card>
  );
}
