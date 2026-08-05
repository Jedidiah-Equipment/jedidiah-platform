import type { PartSearchRow } from '@pkg/schema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { loadingSpinnerColor } from '@/theme/brand-colors';

/** Short enough that the answer is one glance rather than a scroll, on a list nobody browses. */
const PART_SEARCH_PAGE_SIZE = 10;

/**
 * The universal fallback for a label nobody can scan (spec §10): find the Part by typing part of
 * its code or name.
 *
 * The search runs on the server. It used to filter the whole stock report on the device, which
 * worked only because that report happened to be the one Part list the price-blind `stores` role
 * can see — it also meant downloading the entire catalog to answer one question, and re-filtering
 * it on every keystroke. `inventory.partSearch` asks the question directly instead.
 */
export function PartSearchList({ onSelect, search }: { onSelect: (partCode: string) => void; search: string }) {
  const trpc = useTRPC();
  // Debounced, so a request goes out when somebody stops typing rather than once per character.
  const debouncedSearch = useDebouncedSearch(search);
  const isSearching = debouncedSearch.trim().length > 0;

  const results = useInfiniteQuery(
    trpc.inventory.partSearch.infiniteQueryOptions(
      { limit: PART_SEARCH_PAGE_SIZE, search: debouncedSearch },
      {
        enabled: isSearching,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        // Hold the previous matches while the next search resolves, so the list does not blink
        // empty between keystrokes.
        placeholderData: keepPreviousData,
      },
    ),
  );

  const items = useMemo(() => results.data?.pages.flatMap((page) => page.items) ?? [], [results.data?.pages]);
  const total = results.data?.pages.at(-1)?.total ?? 0;

  if (!isSearching) return null;

  if (results.isPending) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator accessibilityLabel="Searching Parts" color={loadingSpinnerColor} size="small" />
      </View>
    );
  }

  if (results.isError) {
    return <Text className="py-6 text-center text-sm text-danger">Couldn’t search Parts. Pull down to retry.</Text>;
  }

  if (items.length === 0) {
    return (
      <Text className="py-6 text-center text-sm text-muted-foreground">
        No Part matches “{debouncedSearch.trim()}”.
      </Text>
    );
  }

  return (
    <View className="gap-2">
      {items.map((row) => (
        <PartSearchRowTile key={row.partId} onSelect={onSelect} row={row} />
      ))}

      {results.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          className="items-center rounded-xl border border-border bg-surface px-4 py-3"
          disabled={results.isFetchingNextPage}
          onPress={() => void results.fetchNextPage()}
        >
          <Text className="text-sm text-surface-foreground" weight="semibold">
            {results.isFetchingNextPage ? 'Loading…' : `Load more (${items.length} of ${total})`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PartSearchRowTile({ onSelect, row }: { onSelect: (partCode: string) => void; row: PartSearchRow }) {
  return (
    <Pressable
      accessibilityLabel={`${row.partCode} ${row.partName}`}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
      onPress={() => onSelect(row.partCode)}
    >
      {/*
        Name leads, code follows. Somebody searching here could not read the label — so they are
        working from what the Part *is*, and the code is what they confirm against the bin once the
        right row is found. It also matches the Part screen this row opens, which titles by name.
      */}
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
          {row.partName}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground" mono numberOfLines={1}>
          {row.partCode}
        </Text>
      </View>
      <Text className="shrink-0 text-sm text-surface-foreground" weight="semibold">
        {row.quantity} {row.unitOfMeasure}
      </Text>
    </Pressable>
  );
}
