import { formatDate, formatNumber } from '@pkg/domain';
import type { SourceCheckoutOption } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

import { StoresOptionPicker } from './StoresOptionPicker';

const SOURCE_PAGE_SIZE = 20;

/** Which Checkout Without a Job of this Part the return reverses; it fixes the length and Recipient. */
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
  const checkouts = useInfiniteQuery(
    trpc.inventory.sourceCheckouts.infiniteQueryOptions(
      { limit: SOURCE_PAGE_SIZE, partId, search: debouncedSearch },
      {
        enabled: selected === null,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = useMemo(() => checkouts.data?.pages.flatMap((page) => page.items) ?? [], [checkouts.data?.pages]);

  return (
    <StoresOptionPicker
      accessibilityLabel={(checkout) => `${checkout.recipientName}, ${checkout.note}`}
      changeHint="Choose a different Checkout"
      emptyMessage="No Checkouts without a Job found."
      label="ORIGINAL CHECKOUT"
      noun="Checkouts"
      onSearchChange={onSearchChange}
      onSelect={onSelect}
      paging="button"
      query={{ ...checkouts, items }}
      renderOption={(checkout) => (
        <>
          <View className="flex-row justify-between gap-3">
            <Text className="min-w-0 flex-1 text-base text-surface-foreground" numberOfLines={1} weight="semibold">
              {checkout.recipientName}
            </Text>
            <Text className="text-sm text-muted-foreground" weight="semibold">
              {formatDate(checkout.createdAt, 'medium')}
            </Text>
          </View>
          <Text className="mt-1 text-sm text-muted-foreground">{checkout.note}</Text>
          <Text className="mt-1 text-xs text-muted-foreground" mono>
            {formatNumber(checkout.quantity)} taken · {formatNumber(checkout.returnedQuantity)} returned
          </Text>
        </>
      )}
      search={search}
      searchLabel="Search Checkouts"
      searchPlaceholder="Search Part, recipient, or purpose"
      selected={selected}
    />
  );
}
