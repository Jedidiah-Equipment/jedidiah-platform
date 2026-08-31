import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { StoresScreen } from '@/components/stores/StoresScreen';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';

/**
 * The Jobs whose stock life should be ending: completed, not yet closed out, still holding
 * commitment or leftovers (spec §3).
 *
 * The one place on the tablet that starts from a Job rather than a Part label, which is why it has
 * its own destination on the scan home instead of hanging off a scan.
 */
export default function StoresCloseOutQueueRoute() {
  const trpc = useTRPC();
  const router = useRouter();
  const queue = useQuery(trpc.inventory.closeOutQueue.queryOptions());

  return (
    <StoresScreen
      helpTopic="inventoryCloseOut"
      onBack={() => router.dismissTo('/stores')}
      parentLabel="Stores"
      subtitle="JOBS WAITING TO BE CLOSED OUT"
      title="Close-out queue"
    >
      {queue.isPending ? (
        <View className="items-center py-10">
          <ActivityIndicator accessibilityLabel="Loading the queue" size="large" />
        </View>
      ) : queue.isError ? (
        <Text className="py-10 text-center text-sm text-danger">Couldn’t load the queue. Pull down to retry.</Text>
      ) : queue.data.items.length === 0 ? (
        <Text className="py-10 text-center text-sm text-muted-foreground">
          Nothing is waiting. Every completed Job has had its stock closed out.
        </Text>
      ) : (
        <View className="gap-3">
          {queue.data.items.map((row) => (
            <Pressable
              accessibilityLabel={`${row.code} ${row.displayName}`}
              accessibilityRole="button"
              className="gap-1 rounded-2xl border border-border bg-surface px-4 py-4"
              key={row.jobId}
              onPress={() => router.push({ params: { jobId: row.jobId }, pathname: '/stores/close-out/[jobId]' })}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-base text-surface-foreground" mono weight="semibold">
                  {row.code}
                </Text>
                {/* Age is the stale-commitment signal (spec §12); the queue is worked oldest-first. */}
                <Text className={`text-sm ${row.isStale ? 'text-danger' : 'text-muted-foreground'}`} weight="semibold">
                  {row.ageDays} days
                </Text>
              </View>
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                {row.displayName}
              </Text>
              <Text className="mt-1 text-sm text-surface-foreground">
                {row.drawnPartCount} Parts still out · {row.committedPartCount} still committed
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </StoresScreen>
  );
}
