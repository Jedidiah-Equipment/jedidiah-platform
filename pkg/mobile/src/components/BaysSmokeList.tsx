import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';

/**
 * Smoke test for the tRPC + React Query data layer (#516): reads `jobs.listBays`
 * over the authed client and renders the bays so the round-trip is visible on device.
 */
export function BaysSmokeList() {
  const trpc = useTRPC();
  const { data, isPending, error } = useQuery(trpc.jobs.listBays.queryOptions());

  if (isPending) {
    return (
      <View className="flex-row items-center gap-2">
        <ActivityIndicator />
        <Text className="text-base leading-6 text-muted-foreground">Loading bays…</Text>
      </View>
    );
  }

  if (error) {
    return <Text className="text-base leading-6 text-danger">Failed to load bays: {error.message}</Text>;
  }

  return (
    <View className="gap-2">
      <Text className="text-sm leading-5 text-muted-foreground" weight="semibold">
        Bays ({data.items.length})
      </Text>
      {data.items.map((bay) => (
        <View key={bay.id} className="rounded-lg border border-border px-3 py-2">
          <Text className="text-base leading-6 text-foreground" weight="semibold">
            {bay.name}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">{bay.department}</Text>
        </View>
      ))}
    </View>
  );
}
