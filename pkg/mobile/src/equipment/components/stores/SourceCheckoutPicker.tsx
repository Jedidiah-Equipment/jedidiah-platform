import { formatDate, formatNumber } from '@pkg/domain';
import type { SourceCheckoutOption } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

import { StoresLoadMoreButton } from './StoresLoadMoreButton';

export function SourceCheckoutPicker({
  onSearchChange,
  onSelect,
  partId,
  search,
  selected,
}: {
  onSearchChange: (value: string) => void;
  onSelect: (checkout: SourceCheckoutOption | null) => void;
  partId: string;
  search: string;
  selected: SourceCheckoutOption | null;
}) {
  const trpc = useTRPC();
  const debouncedSearch = useDebouncedSearch(search);
  const results = useInfiniteQuery(
    trpc.inventory.sourceCheckouts.infiniteQueryOptions(
      { limit: 20, partId, search: debouncedSearch },
      {
        enabled: selected === null,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = useMemo(() => results.data?.pages.flatMap((page) => page.items) ?? [], [results.data?.pages]);

  return (
    <View className="gap-2">
      <Text className="text-[11px] text-muted-foreground" mono>
        ORIGINAL CHECKOUT
      </Text>
      {selected ? (
        <CheckoutTile checkout={selected} onPress={() => onSelect(null)} selected />
      ) : (
        <>
          <TextInput
            accessibilityLabel="Search Checkouts"
            onChangeText={onSearchChange}
            placeholder="Search recipient or purpose"
            textSize="toolbar"
            value={search}
          />
          {results.isPending ? <ActivityIndicator accessibilityLabel="Loading Checkouts" size="small" /> : null}
          {items.map((checkout) => (
            <CheckoutTile checkout={checkout} key={checkout.id} onPress={() => onSelect(checkout)} />
          ))}
          {results.hasNextPage ? (
            <StoresLoadMoreButton isLoading={results.isFetchingNextPage} onPress={() => void results.fetchNextPage()} />
          ) : null}
        </>
      )}
    </View>
  );
}

function CheckoutTile({
  checkout,
  onPress,
  selected = false,
}: {
  checkout: SourceCheckoutOption;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${checkout.recipientName}, ${checkout.note}`}
      accessibilityRole="button"
      className="rounded-xl border border-border bg-surface px-3 py-3"
      onPress={onPress}
    >
      <View className="flex-row justify-between gap-3">
        <Text className="min-w-0 flex-1 text-base text-surface-foreground" numberOfLines={1} weight="semibold">
          {checkout.recipientName}
        </Text>
        <Text className="text-sm text-muted-foreground" weight="semibold">
          {formatDate(checkout.createdAt, 'medium')}
          {selected ? ' · Change' : ''}
        </Text>
      </View>
      <Text className="mt-1 text-sm text-muted-foreground">{checkout.note}</Text>
      <Text className="mt-1 text-xs text-muted-foreground" mono>
        {formatNumber(checkout.quantity)} taken · {formatNumber(checkout.returnedQuantity)} returned
      </Text>
    </Pressable>
  );
}
