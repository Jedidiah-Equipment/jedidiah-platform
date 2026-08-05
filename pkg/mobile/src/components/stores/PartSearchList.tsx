import type { StockOnHandRow } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';
import { loadingSpinnerColor } from '@/theme/brand-colors';

/**
 * The universal fallback for a label nobody can scan (spec §10): find the Part by typing part of
 * its code or name.
 *
 * It searches the stock report rather than the Part catalog, and that is not a shortcut — the
 * `stores` role holds `inventory:read` and no `part:read` at all (spec §11's matrix), so the stock
 * report *is* the Part list this device can see. It arrives already cost-projected, which is also
 * why no price can leak into these rows.
 */
export function PartSearchList({ onSelect, search }: { onSelect: (partCode: string) => void; search: string }) {
  const trpc = useTRPC();
  const query = search.trim().toLowerCase();
  const stock = useQuery(trpc.inventory.stockOnHand.queryOptions(undefined, { enabled: query.length > 0 }));

  const matches = useMemo(() => {
    if (query.length === 0) return [];

    return (stock.data?.items ?? [])
      .filter((row) => row.partCode.toLowerCase().includes(query) || row.partName.toLowerCase().includes(query))
      .slice(0, 25);
  }, [query, stock.data?.items]);

  if (query.length === 0) return null;

  if (stock.isPending) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator accessibilityLabel="Searching Parts" color={loadingSpinnerColor} size="small" />
      </View>
    );
  }

  if (stock.isError) {
    return <Text className="py-6 text-center text-sm text-danger">Couldn’t search Parts. Pull down to retry.</Text>;
  }

  if (matches.length === 0) {
    return <Text className="py-6 text-center text-sm text-muted-foreground">No Part matches “{search.trim()}”.</Text>;
  }

  return (
    <View className="gap-2">
      {matches.map((row) => (
        <PartSearchRow key={row.partId} onSelect={onSelect} row={row} />
      ))}
    </View>
  );
}

function PartSearchRow({ onSelect, row }: { onSelect: (partCode: string) => void; row: StockOnHandRow }) {
  return (
    <Pressable
      accessibilityLabel={`${row.partCode} ${row.partName}`}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
      onPress={() => onSelect(row.partCode)}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-surface-foreground" mono numberOfLines={1} weight="semibold">
          {row.partCode}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
          {row.partName}
        </Text>
      </View>
      <Text className="shrink-0 text-sm text-surface-foreground" weight="semibold">
        {row.quantity} {row.unitOfMeasure}
      </Text>
    </Pressable>
  );
}
