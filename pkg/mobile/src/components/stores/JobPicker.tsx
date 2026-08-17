import type { InventoryJobOption, JobStockMovementType } from '@pkg/schema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { loadingSpinnerColor } from '@/theme/brand-colors';

/**
 * Which Job the stock is going to, or coming back from.
 *
 * Read through `inventory.jobOptions` rather than the Job list: the `stores` role holds no
 * `job:read` at all (spec §11's matrix), and this picker is the only Job surface the tablet has.
 */
const JOB_PAGE_SIZE = 20;

export type JobPickerHandle = { loadMore: () => void };

export const JobPicker = forwardRef<
  JobPickerHandle,
  {
    movementType: JobStockMovementType;
    onSearchChange: (value: string) => void;
    onSelect: (job: InventoryJobOption | null) => void;
    search: string;
    selected: InventoryJobOption | null;
  }
>(function JobPicker({ movementType, onSearchChange, onSelect, search, selected }, ref) {
  const trpc = useTRPC();
  const debouncedSearch = useDebouncedSearch(search);
  const jobs = useInfiniteQuery(
    trpc.inventory.jobOptions.infiniteQueryOptions(
      { limit: JOB_PAGE_SIZE, movementType, search: debouncedSearch },
      {
        enabled: selected === null,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const items = useMemo(() => jobs.data?.pages.flatMap((page) => page.items) ?? [], [jobs.data?.pages]);
  const loadMore = useCallback(() => {
    if (jobs.hasNextPage && !jobs.isFetchingNextPage) void jobs.fetchNextPage();
  }, [jobs.fetchNextPage, jobs.hasNextPage, jobs.isFetchingNextPage]);

  useImperativeHandle(ref, () => ({ loadMore }), [loadMore]);

  if (selected !== null) {
    return (
      <View className="gap-1.5">
        <Text className="text-[11px] text-muted-foreground" mono>
          JOB
        </Text>
        <Pressable
          accessibilityHint="Choose a different Job"
          accessibilityLabel={`Job ${selected.code}, ${selected.displayName}`}
          accessibilityRole="button"
          className="flex-row items-center justify-between rounded-xl border border-border bg-surface px-3 py-3"
          onPress={() => onSelect(null)}
        >
          <View className="min-w-0 flex-1">
            <Text className="text-base text-surface-foreground" mono weight="semibold">
              {selected.code}
            </Text>
            <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
              {selected.displayName}
            </Text>
          </View>
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
        JOB
      </Text>
      <TextInput
        accessibilityLabel="Search Jobs"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onSearchChange}
        placeholder="Search jobs by code or name"
        textSize="toolbar"
        value={search}
      />
      {jobs.isPending ? (
        <View className="items-center py-4">
          <ActivityIndicator accessibilityLabel="Loading Jobs" color={loadingSpinnerColor} size="small" />
        </View>
      ) : jobs.isError ? (
        <Text className="py-4 text-center text-sm text-danger">Couldn’t load Jobs. Pull down to retry.</Text>
      ) : items.length === 0 ? (
        <Text className="py-4 text-center text-sm text-muted-foreground">
          {debouncedSearch ? 'No Job matches that search.' : movementType === 'checkout' ? 'No open Jobs.' : 'No Jobs.'}
        </Text>
      ) : (
        <View className="gap-2">
          {items.map((job) => (
            <Pressable
              accessibilityLabel={`${job.code} ${job.displayName}`}
              accessibilityRole="button"
              className="rounded-xl border border-border bg-surface px-3 py-3"
              key={job.id}
              onPress={() => onSelect(job)}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-base text-surface-foreground" mono weight="semibold">
                  {job.code}
                </Text>
                {job.completedOn === null ? null : (
                  <Text className="shrink-0 text-xs text-muted-foreground" mono>
                    COMPLETED
                  </Text>
                )}
              </View>
              <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
                {job.displayName}
              </Text>
            </Pressable>
          ))}
          {jobs.isFetchingNextPage ? (
            <View className="items-center py-3">
              <ActivityIndicator accessibilityLabel="Loading more Jobs" color={loadingSpinnerColor} size="small" />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
});
