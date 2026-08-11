import { deriveMovementWarnings } from '@pkg/domain';
import type { PartPurchaseOrderLine, StockMovementWarningCode, StockOnHandRow } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { LengthBucketField } from '@/components/stores/LengthBucketField';
import { MovementWarningModal } from '@/components/stores/MovementWarningModal';
import { PostButton } from '@/components/stores/PostButton';
import { PurchaseOrderLinePicker } from '@/components/stores/PurchaseOrderLinePicker';
import { hasRequiredLength, parseQuantity, QuantityField } from '@/components/stores/QuantityField';
import { NoActorNotice, StoresPartScreen } from '@/components/stores/StoresPartScreen';
import { useMovementActorUserId } from '@/lib/stores-actor';
import { resolveStoresMovementParent } from '@/lib/toolbar-navigation';
import { useTRPC } from '@/lib/trpc';
import { useMovementConfirm } from '@/lib/use-movement-confirm';
import { useStoresPostOutcome } from '@/lib/use-stores-post';

/**
 * Signing for a delivery at the dock. Receiving *is* the ledger write (spec §11) — there is no
 * paper-only step here that a later posting could drift away from.
 *
 * No price appears and none is sent. Leaving `unitCost` off means the line's own price lands on the
 * movement, which is exactly how a price-blind receiver still posts a correctly valued row.
 */
export default function StoresReceiveRoute() {
  const { partCode } = useLocalSearchParams<{ partCode: string }>();

  return (
    <StoresPartScreen partCode={partCode} title="Receive against an order">
      {(row) => <ReceiveForm row={row} />}
    </StoresPartScreen>
  );
}

function ReceiveForm({ row }: { row: StockOnHandRow }) {
  const trpc = useTRPC();
  const actorUserId = useMovementActorUserId();
  const [line, setLine] = useState<PartPurchaseOrderLine | null>(null);
  const [quantity, setQuantity] = useState('');
  const [keyedLengthMm, setKeyedLengthMm] = useState<string | null>(null);

  const outcome = useStoresPostOutcome({
    returnTo: resolveStoresMovementParent({ partCode: row.partCode }).returnTo,
    successMessage: 'Receipt posted',
  });
  const mutation = useMutation(
    trpc.purchaseOrders.receive.mutationOptions({ onError: outcome.onError, onSuccess: outcome.onSuccess }),
  );

  const confirmFlow = useMovementConfirm({ acknowledge: outcome.acknowledge });
  const isLinear = row.unitOfMeasure === 'mm';
  const lengthMm = keyedLengthMm ?? (row.standardPurchaseLengthMm === null ? '' : String(row.standardPurchaseLengthMm));
  const parsedQuantity = parseQuantity(quantity);
  const parsedLength = isLinear ? parseQuantity(lengthMm) : null;
  const hasLength = hasRequiredLength({ isLinear, lengthMm: parsedLength });

  /** Both facts a receipt is judged against ride the line the dock just picked. */
  function previewWarnings(): StockMovementWarningCode[] {
    if (parsedQuantity === null || line === null) return [];

    return deriveMovementWarnings({
      facts: { kind: 'receipt', orderedQuantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity },
      quantity: parsedQuantity,
    });
  }

  return (
    <>
      <PurchaseOrderLinePicker
        mode="receive"
        onSelect={(next) => {
          setLine(next);
          // What is still owed is what usually turned up, so it is prefilled — and still keyed,
          // because a short delivery is the case that must not be waved through by a default.
          setQuantity(next === null ? '' : String(next.outstandingQuantity));
        }}
        partId={row.partId}
        selected={line}
        unitOfMeasure={row.unitOfMeasure}
      />

      <QuantityField
        label="Quantity received"
        onChange={setQuantity}
        placeholder="0"
        unit={row.unitOfMeasure}
        value={quantity}
      />

      {isLinear ? (
        <LengthBucketField
          buckets={row.buckets}
          onChange={setKeyedLengthMm}
          standardPurchaseLengthMm={row.standardPurchaseLengthMm}
          value={lengthMm}
        />
      ) : null}

      <NoActorNotice actorUserId={actorUserId} />

      <PostButton
        disabled={parsedQuantity === null || line === null || actorUserId === null || !hasLength}
        isPending={mutation.isPending}
        label="Post receipt"
        onPress={() => {
          if (parsedQuantity === null || line === null || actorUserId === null) return;

          confirmFlow.submit({
            post: () =>
              mutation.mutate({
                actorUserId,
                lengthMm: parsedLength,
                partId: row.partId,
                purchaseOrderId: line.purchaseOrderId,
                quantity: parsedQuantity,
              }),
            warnings: previewWarnings(),
          });
        }}
      />

      <MovementWarningModal
        mode="confirm"
        onClose={confirmFlow.cancel}
        onConfirm={confirmFlow.confirm}
        warnings={confirmFlow.pendingWarnings}
      />
      <MovementWarningModal mode="posted" onClose={outcome.acknowledgeWarnings} warnings={outcome.warnings} />
    </>
  );
}
