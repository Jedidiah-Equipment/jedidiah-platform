import type { InventoryRecipientOption } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

import { StoresLoadMoreButton } from './StoresLoadMoreButton';

export function RecipientPicker({
  onSearchChange,
  onSelect,
  search,
  selected,
}: {
  onSearchChange: (value: string) => void;
  onSelect: (person: InventoryRecipientOption | null) => void;
  search: string;
  selected: InventoryRecipientOption | null;
}) {
  const trpc = useTRPC();
  const debouncedSearch = useDebouncedSearch(search);
  const results = useInfiniteQuery(
    trpc.inventory.recipientOptions.infiniteQueryOptions(
      { limit: 20, search: debouncedSearch },
      {
        enabled: selected === null,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = useMemo(() => results.data?.pages.flatMap((page) => page.items) ?? [], [results.data?.pages]);

  if (selected) {
    return <SelectedTile label="RECEIVED BY" name={selected.name} onChange={() => onSelect(null)} />;
  }

  return (
    <View className="gap-2">
      <Text className="text-[11px] text-muted-foreground" mono>
        RECEIVED BY
      </Text>
      <TextInput
        accessibilityLabel="Search recipients"
        onChangeText={onSearchChange}
        placeholder="Search people"
        textSize="toolbar"
        value={search}
      />
      {results.isPending ? <ActivityIndicator accessibilityLabel="Loading recipients" size="small" /> : null}
      {items.map((person) => (
        <Pressable
          accessibilityLabel={person.name}
          accessibilityRole="button"
          className="rounded-xl border border-border bg-surface px-3 py-3"
          key={person.id}
          onPress={() => onSelect(person)}
        >
          <Text className="text-base text-surface-foreground" weight="semibold">
            {person.name}
          </Text>
        </Pressable>
      ))}
      {results.hasNextPage ? (
        <StoresLoadMoreButton isLoading={results.isFetchingNextPage} onPress={() => void results.fetchNextPage()} />
      ) : null}
    </View>
  );
}

function SelectedTile({ label, name, onChange }: { label: string; name: string; onChange: () => void }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[11px] text-muted-foreground" mono>
        {label}
      </Text>
      <Pressable
        accessibilityHint="Choose a different person"
        accessibilityLabel={`${label}: ${name}`}
        accessibilityRole="button"
        className="flex-row items-center justify-between rounded-xl border border-border bg-surface px-3 py-3"
        onPress={onChange}
      >
        <Text className="text-base text-surface-foreground" weight="semibold">
          {name}
        </Text>
        <Text className="text-sm text-muted-foreground" weight="semibold">
          Change
        </Text>
      </Pressable>
    </View>
  );
}
