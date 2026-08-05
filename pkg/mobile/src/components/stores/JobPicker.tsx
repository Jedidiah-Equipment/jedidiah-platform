import type { InventoryJobOption } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
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
export function JobPicker({
  onSearchChange,
  onSelect,
  search,
  selected,
}: {
  onSearchChange: (value: string) => void;
  onSelect: (job: InventoryJobOption | null) => void;
  search: string;
  selected: InventoryJobOption | null;
}) {
  const trpc = useTRPC();
  const debouncedSearch = useDebouncedSearch(search);
  const jobs = useQuery(
    trpc.inventory.jobOptions.queryOptions(
      { cursor: 0, limit: 20, search: debouncedSearch || undefined, sortBy: 'createdAt', sortDirection: 'desc' },
      { enabled: selected === null },
    ),
  );

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
        placeholder="Search Jobs by code or name"
        textSize="toolbar"
        value={search}
      />
      {jobs.isPending ? (
        <View className="items-center py-4">
          <ActivityIndicator accessibilityLabel="Loading Jobs" color={loadingSpinnerColor} size="small" />
        </View>
      ) : jobs.isError ? (
        <Text className="py-4 text-center text-sm text-danger">Couldn’t load Jobs. Pull down to retry.</Text>
      ) : jobs.data.items.length === 0 ? (
        <Text className="py-4 text-center text-sm text-muted-foreground">No Job matches that search.</Text>
      ) : (
        <View className="gap-2">
          {jobs.data.items.map((job) => (
            <Pressable
              accessibilityLabel={`${job.code} ${job.displayName}`}
              accessibilityRole="button"
              className="rounded-xl border border-border bg-surface px-3 py-3"
              key={job.id}
              onPress={() => onSelect(job)}
            >
              <Text className="text-base text-surface-foreground" mono weight="semibold">
                {job.code}
              </Text>
              <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
                {job.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
