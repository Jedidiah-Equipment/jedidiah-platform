import { deriveMovementWarnings } from '@pkg/domain';
import type {
  PartPurchaseOrderLine,
  StockMovementWarningCode,
  StockOnHandRow,
  StockReturnToSupplierReason,
} from '@pkg/schema';
import { StockReturnToSupplierReason as ReasonEnum, STOCK_RETURN_TO_SUPPLIER_REASON_LABELS } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { LengthBucketField } from '@/components/stores/LengthBucketField';
import { MovementWarningModal } from '@/components/stores/MovementWarningModal';
import { PostButton } from '@/components/stores/PostButton';
import { PurchaseOrderLinePicker } from '@/components/stores/PurchaseOrderLinePicker';
import { hasRequiredLength, parseQuantity, QuantityField } from '@/components/stores/QuantityField';
import { NoActorNotice, StoresPartScreen } from '@/components/stores/StoresPartScreen';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useMovementActorUserId } from '@/lib/stores-actor';
import { resolveStoresMovementParent } from '@/lib/toolbar-navigation';
import { useTRPC } from '@/lib/trpc';
import { useMovementConfirm } from '@/lib/use-movement-confirm';
import { useStoresPostOutcome } from '@/lib/use-stores-post';

/**
 * Sending stock back off a Purchase Order line — the wrong item, or one that arrived broken.
 *
 * The value is never keyed here, and there is nowhere to key it: a return reverses at the stamped
 * cost of the receipts the line already holds (spec §4), so the dock says only what is going back
 * and why. That is also what keeps this screen honestly price-blind.
 */
export default function StoresReturnToSupplierRoute() {
  const { partCode } = useLocalSearchParams<{ partCode: string }>();

  return (
    <StoresPartScreen partCode={partCode} title="Return to Supplier">
      {(row) => <ReturnToSupplierForm row={row} />}
    </StoresPartScreen>
  );
}

function ReturnToSupplierForm({ row }: { row: StockOnHandRow }) {
  const trpc = useTRPC();
  const actorUserId = useMovementActorUserId();
  const [line, setLine] = useState<PartPurchaseOrderLine | null>(null);
  const [quantity, setQuantity] = useState('');
  const [keyedLengthMm, setKeyedLengthMm] = useState<string | null>(null);
  const [reason, setReason] = useState<StockReturnToSupplierReason | null>(null);
  const [note, setNote] = useState('');

  const outcome = useStoresPostOutcome({
    returnTo: resolveStoresMovementParent({ partCode: row.partCode }).returnTo,
    successMessage: 'Return to Supplier posted',
  });
  const mutation = useMutation(
    trpc.purchaseOrders.returnToSupplier.mutationOptions({ onError: outcome.onError, onSuccess: outcome.onSuccess }),
  );

  const confirmFlow = useMovementConfirm({ acknowledge: outcome.acknowledge });
  const isLinear = row.unitOfMeasure === 'mm';
  const lengthMm = keyedLengthMm ?? (row.standardPurchaseLengthMm === null ? '' : String(row.standardPurchaseLengthMm));
  const parsedQuantity = parseQuantity(quantity);
  const parsedLength = isLinear ? parseQuantity(lengthMm) : null;
  const hasLength = hasRequiredLength({ isLinear, lengthMm: parsedLength });

  /**
   * What this line can still send back in the bucket the return would post against, served by the
   * order read and judged here exactly as the post judges it. Read rather than computed: netting a
   * threshold out of Part-wide totals is what let the browser and this screen disagree with the
   * ledger about a line received in two lengths.
   */
  function previewWarnings(): StockMovementWarningCode[] {
    if (parsedQuantity === null || line === null) return [];

    const bucket = line.receiptBuckets.find((candidate) => candidate.lengthMm === parsedLength);

    return deriveMovementWarnings({
      facts: { kind: 'return-to-supplier', outstandingReceivedQuantity: bucket?.outstandingReceivedQuantity ?? 0 },
      quantity: parsedQuantity,
    });
  }

  return (
    <>
      <PurchaseOrderLinePicker
        mode="return"
        onSelect={setLine}
        partId={row.partId}
        selected={line}
        unitOfMeasure={row.unitOfMeasure}
      />

      <QuantityField
        label="Quantity going back"
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

      <View className="gap-2">
        <Text className="text-[11px] text-muted-foreground" mono>
          REASON
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {ReasonEnum.options.map((option) => {
            const isSelected = reason === option;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={`rounded-xl border px-4 py-3 ${
                  isSelected ? 'border-primary bg-primary' : 'border-border bg-surface'
                }`}
                key={option}
                onPress={() => setReason(option)}
              >
                <Text
                  className={`text-base ${isSelected ? 'text-primary-foreground' : 'text-surface-foreground'}`}
                  weight="semibold"
                >
                  {STOCK_RETURN_TO_SUPPLIER_REASON_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-1.5">
        <Text className="text-[11px] text-muted-foreground" mono>
          NOTE (OPTIONAL)
        </Text>
        <TextInput
          accessibilityLabel="Note"
          multiline
          numberOfLines={3}
          onChangeText={setNote}
          placeholder="What was wrong with it?"
          value={note}
        />
      </View>

      <NoActorNotice actorUserId={actorUserId} />

      <PostButton
        disabled={parsedQuantity === null || line === null || reason === null || actorUserId === null || !hasLength}
        isPending={mutation.isPending}
        label="Post return"
        onPress={() => {
          if (parsedQuantity === null || line === null || reason === null || actorUserId === null) return;

          outcome.keepAlive();
          confirmFlow.submit({
            post: () =>
              mutation.mutate({
                actorUserId,
                lengthMm: parsedLength,
                note: note.trim() === '' ? null : note.trim(),
                partId: row.partId,
                purchaseOrderId: line.purchaseOrderId,
                quantity: parsedQuantity,
                reason,
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
