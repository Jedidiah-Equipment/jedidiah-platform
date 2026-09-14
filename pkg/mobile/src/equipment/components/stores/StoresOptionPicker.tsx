import type React from 'react';
import { Pressable, View } from 'react-native';

import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';

import { StoresLoadMoreButton } from './StoresLoadMoreButton';

/**
 * How the tablet picks one thing out of a searched, paged list — a Job, a person, a Checkout. The
 * choice collapses to one tile with Change on it, and the list is only asked for while nothing is
 * chosen, which each picker's query enables on.
 */
export function StoresOptionPicker<TOption extends { id: string }>({
  accessibilityLabel,
  changeHint,
  emptyMessage,
  label,
  noun,
  onSearchChange,
  onSelect,
  paging,
  query,
  renderOption,
  search,
  searchLabel,
  searchPlaceholder,
  selected,
}: {
  accessibilityLabel: (option: TOption) => string;
  changeHint: string;
  emptyMessage: string;
  label: string;
  /** What the list holds, as the loading and failure sentences name it: "Jobs", "people". */
  noun: string;
  onSearchChange: (value: string) => void;
  onSelect: (option: TOption | null) => void;
  /** Who asks for the next page: the list's own Load more button, or the screen at its scroll end. */
  paging: 'button' | 'scroll';
  query: {
    fetchNextPage: () => unknown;
    hasNextPage: boolean;
    isError: boolean;
    isFetchingNextPage: boolean;
    isPending: boolean;
    items: readonly TOption[];
  };
  renderOption: (option: TOption) => React.ReactNode;
  search: string;
  searchLabel: string;
  searchPlaceholder: string;
  selected: TOption | null;
}) {
  if (selected !== null) {
    return (
      <View className="gap-1.5">
        <Text className="text-[11px] text-muted-foreground" mono>
          {label}
        </Text>
        <Pressable
          accessibilityHint={changeHint}
          accessibilityLabel={`${label}: ${accessibilityLabel(selected)}`}
          accessibilityRole="button"
          className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-3"
          onPress={() => onSelect(null)}
        >
          <View className="min-w-0 flex-1">{renderOption(selected)}</View>
          <Text className="shrink-0 text-sm text-muted-foreground" weight="semibold">
            Change
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Text className="text-[11px] text-muted-foreground" mono>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={searchLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onSearchChange}
        placeholder={searchPlaceholder}
        textSize="toolbar"
        value={search}
      />
      {query.isPending ? (
        <View className="items-center py-4">
          <ActivityIndicator accessibilityLabel={`Loading ${noun}`} size="small" />
        </View>
      ) : query.isError ? (
        <Text className="py-4 text-center text-sm text-danger">Couldn’t load {noun}. Pull down to retry.</Text>
      ) : query.items.length === 0 ? (
        <Text className="py-4 text-center text-sm text-muted-foreground">{emptyMessage}</Text>
      ) : (
        <View className="gap-2">
          {query.items.map((option) => (
            <Pressable
              accessibilityLabel={accessibilityLabel(option)}
              accessibilityRole="button"
              className="rounded-xl border border-border bg-surface px-3 py-3"
              key={option.id}
              onPress={() => onSelect(option)}
            >
              {renderOption(option)}
            </Pressable>
          ))}
          {paging === 'button' && query.hasNextPage ? (
            <StoresLoadMoreButton isLoading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} />
          ) : null}
          {paging === 'scroll' && query.isFetchingNextPage ? (
            <View className="items-center py-3">
              <ActivityIndicator accessibilityLabel={`Loading more ${noun}`} size="small" />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
