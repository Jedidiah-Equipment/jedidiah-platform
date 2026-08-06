import { formatDate } from '@pkg/domain';
import type { PartPurchaseOrderLine } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';
import { loadingSpinnerColor } from '@/theme/brand-colors';

/**
 * Which sent Purchase Order line this delivery — or this return — belongs to.
 *
 * `mode` decides which lines are worth showing, and each mode mirrors the server gate it will post
 * through rather than guessing a stricter rule of its own: receiving offers any line of an order
 * that has not been closed short, while a return offers whatever has actually arrived. They are
 * drawn from one read because a half-received line legitimately appears in both (spec §4).
 */
export function PurchaseOrderLinePicker({
  mode,
  onSelect,
  partId,
  selected,
  unitOfMeasure,
}: {
  mode: 'receive' | 'return';
  onSelect: (line: PartPurchaseOrderLine | null) => void;
  partId: string;
  selected: PartPurchaseOrderLine | null;
  unitOfMeasure: string;
}) {
  const trpc = useTRPC();
  const lines = useQuery(trpc.purchaseOrders.partLines.queryOptions({ partId }, { enabled: selected === null }));

  if (selected !== null) {
    return (
      <View className="gap-1.5">
        <Text className="text-[11px] text-muted-foreground" mono>
          PURCHASE ORDER
        </Text>
        <Pressable
          accessibilityHint="Choose a different order"
          accessibilityLabel={`Purchase Order ${selected.purchaseOrderCode}, ${selected.supplierName}`}
          accessibilityRole="button"
          className="flex-row items-center justify-between rounded-xl border border-border bg-surface px-3 py-3"
          onPress={() => onSelect(null)}
        >
          <View className="min-w-0 flex-1">
            <Text className="text-base text-surface-foreground" mono weight="semibold">
              {selected.purchaseOrderCode}
            </Text>
            <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
              {selected.supplierName}
            </Text>
          </View>
          <Text className="shrink-0 text-sm text-muted-foreground" weight="semibold">
            Change
          </Text>
        </Pressable>
      </View>
    );
  }

  const relevant = (lines.data?.items ?? []).filter((line) =>
    mode === 'receive'
      ? // Exactly what the server's own receive gate allows: a sent order that has not been closed
        // short. Deliberately *not* filtered on outstanding quantity — a Supplier who ships twelve
        // against ten has delivered twelve, and the ledger has to be able to say so. Over-receipt
        // warns and posts (spec §3); hiding the line would leave the dock unable to book what is
        // physically in front of it. A closed-short line refuses receipts, so it stays out here and
        // stays available to a return below.
        line.closedShortAt === null
      : line.receivedQuantity > 0,
  );

  return (
    <View className="gap-2">
      <Text className="text-[11px] text-muted-foreground" mono>
        PURCHASE ORDER
      </Text>
      {lines.isPending ? (
        <View className="items-center py-4">
          <ActivityIndicator accessibilityLabel="Loading orders" color={loadingSpinnerColor} size="small" />
        </View>
      ) : lines.isError ? (
        <Text className="py-4 text-center text-sm text-danger">Couldn’t load orders. Pull down to retry.</Text>
      ) : relevant.length === 0 ? (
        <Text className="py-4 text-center text-sm text-muted-foreground">
          {mode === 'receive' ? 'No open sent order carries this Part.' : 'No sent order has taken this Part in yet.'}
        </Text>
      ) : (
        <View className="gap-2">
          {relevant.map((line) => (
            <Pressable
              accessibilityLabel={`${line.purchaseOrderCode} from ${line.supplierName}`}
              accessibilityRole="button"
              className="rounded-xl border border-border bg-surface px-3 py-3"
              key={line.purchaseOrderId}
              onPress={() => onSelect(line)}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-base text-surface-foreground" mono weight="semibold">
                  {line.purchaseOrderCode}
                </Text>
                <Text className="text-sm text-surface-foreground" weight="semibold">
                  {mode !== 'receive'
                    ? `${line.receivedQuantity} ${unitOfMeasure} received`
                    : // Named rather than shown as "0 still due", so a line that is already full
                      // reads as a deliberate choice to over-receive rather than a picker mistake.
                      line.outstandingQuantity === 0
                      ? 'Fully received'
                      : `${line.outstandingQuantity} ${unitOfMeasure} still due`}
                </Text>
              </View>
              <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
                {line.supplierName}
                {line.expectedDeliveryDate === null ? '' : ` · expected ${formatDate(line.expectedDeliveryDate)}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
