import type { PurchaseOrderView } from '@pkg/schema';
import { IconTruckDelivery } from '@tabler/icons-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { PartLabelPrintButton } from '../../parts/PartLabelPrintButton.js';
import { PurchaseOrderReceiveDialog } from './PurchaseOrderReceiveDialog.js';
import { outstandingQuantity } from './types.js';

/**
 * The dock's view of a sent order: what each line still owes, and the one action that posts it.
 * A refused-at-dock delivery is simply not received — nothing here records it.
 */
export function PurchaseOrderReceivingCard({ purchaseOrder }: { purchaseOrder: PurchaseOrderView }) {
  const [receivingPartId, setReceivingPartId] = useState<string | null>(null);
  const receivingLine = purchaseOrder.lines.find((line) => line.partId === receivingPartId) ?? null;
  const isClosed = purchaseOrder.derivedStatus === 'closed-short';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receiving</CardTitle>
        <CardDescription>
          {isClosed
            ? 'This order was closed short — its open remainder has been released.'
            : 'Confirm what arrived at the dock. Quantities only; the order price is carried through.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseOrder.lines.map((line) => (
              <TableRow key={line.partId}>
                <TableCell>
                  <span className="font-medium">{line.partCode}</span> · {line.partName}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.receivedQuantity} / {line.quantity}
                </TableCell>
                <TableCell className="text-right tabular-nums">{outstandingQuantity(line)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <PartLabelPrintButton partId={line.partId} size="sm" />
                    <Button disabled={isClosed} onClick={() => setReceivingPartId(line.partId)} size="sm" type="button">
                      <IconTruckDelivery data-icon="inline-start" /> Receive
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {receivingLine ? (
        <PurchaseOrderReceiveDialog
          // Remount per line so the dialog's prefilled outstanding quantity follows the line it opens on.
          key={receivingLine.partId}
          line={receivingLine}
          onOpenChange={(open) => setReceivingPartId(open ? receivingPartId : null)}
          open
          purchaseOrder={purchaseOrder}
        />
      ) : null}
    </Card>
  );
}
