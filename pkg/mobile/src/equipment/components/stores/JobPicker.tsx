import { getJobDisplayName } from '@pkg/domain/equipment';
import type { JobPickerOption, JobStockMovementType } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedSearch } from '@/lib/use-debounced-search';

import { StoresOptionPicker } from './StoresOptionPicker';

/**
 * Which Job the stock is going to, or coming back from.
 *
 * Read through `inventory.jobOptions` rather than the Job list: the `stores` role holds no
 * `equipment_job:read` at all (spec §11's matrix), and this picker is the only Job surface the tablet has.
 */
const JOB_PAGE_SIZE = 20;

export type JobPickerHandle = { loadMore: () => void };

export const JobPicker = forwardRef<
  JobPickerHandle,
  {
    movementType: JobStockMovementType;
    onSearchChange: (value: string) => void;
    onSelect: (job: JobPickerOption | null) => void;
    search: string;
    selected: JobPickerOption | null;
  }
>(function JobPicker({ movementType, onSearchChange, onSelect, search, selected }, ref) {
  const trpc = useTRPC();
  const debouncedSearch = useDebouncedSearch(search);
  const jobs = useInfiniteQuery(
    trpc.inventory.jobOptions.infiniteQueryOptions(
      // The tablet has no tab strip, so it asks for the one list it has always shown: open work for
      // a Checkout, and — once the reader searches — every eligible Job, so a late posting still
      // reaches a finished one.
      {
        limit: JOB_PAGE_SIZE,
        movementType,
        search: debouncedSearch,
        tab: movementType === 'checkout' && !debouncedSearch ? 'incomplete' : 'updated',
      },
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

  return (
    <StoresOptionPicker
      accessibilityLabel={(job) => `Job ${job.code}, ${getJobDisplayName(job)}`}
      changeHint="Choose a different Job"
      emptyMessage={
        debouncedSearch ? 'No Job matches that search.' : movementType === 'checkout' ? 'No open Jobs.' : 'No Jobs.'
      }
      label="JOB"
      noun="Jobs"
      onSearchChange={onSearchChange}
      onSelect={onSelect}
      paging="scroll"
      query={{ ...jobs, items }}
      renderOption={(job) => (
        <>
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
            {getJobDisplayName(job)}
          </Text>
        </>
      )}
      search={search}
      searchLabel="Search Jobs"
      searchPlaceholder="Search jobs by code or name"
      selected={selected}
    />
  );
});
