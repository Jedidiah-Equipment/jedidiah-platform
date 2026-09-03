import type { JobStockRow } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useAppToast } from '@/components/ui/toast';
import { PostButton } from '@/equipment/components/stores/PostButton';
import { StoresScreen } from '@/equipment/components/stores/StoresScreen';
import { useMovementActorUserId, useStoresActor } from '@/equipment/lib/stores-actor';
import { invalidateQueryCache } from '@/lib/query-client';
import { useTRPC } from '@/lib/trpc';

/**
 * Return-and-close, the same composition the web screen offers: put the leftovers back first, then
 * end the Job's stock life in one motion (spec §3).
 *
 * The returns themselves go through the ordinary return-to-store path — the rows here link into it
 * by Part code, so a leftover is returned exactly as any other return is, and the close is the only
 * thing this screen posts.
 */
export default function StoresJobCloseOutRoute() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const trpc = useTRPC();
  const router = useRouter();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const actorUserId = useMovementActorUserId();
  const { keepAlive } = useStoresActor();
  const [note, setNote] = useState('');
  const jobStock = useQuery(trpc.inventory.jobStock.queryOptions({ jobId }));

  const closeOut = useMutation({
    ...trpc.inventory.closeOutJob.mutationOptions(),
    onError: (error) => toast('error', error.message),
    onSuccess: async () => {
      await invalidateQueryCache(queryClient);
      toast('success', 'Job stock closed out');
      router.dismissTo('/equipment/stores/close-out');
    },
  });

  if (jobStock.isPending) {
    return (
      <StoresScreen
        helpTopic="inventoryCloseOut"
        onBack={() => router.dismissTo('/equipment/stores/close-out')}
        parentLabel="Close-out queue"
        subtitle="LOADING JOB STOCK"
        title="Close out"
      >
        <View className="items-center py-10">
          <ActivityIndicator accessibilityLabel="Loading Job stock" size="large" />
        </View>
      </StoresScreen>
    );
  }

  if (jobStock.isError) {
    return (
      <StoresScreen
        helpTopic="inventoryCloseOut"
        onBack={() => router.dismissTo('/equipment/stores/close-out')}
        parentLabel="Close-out queue"
        subtitle="JOB STOCK UNAVAILABLE"
        title="Close out"
      >
        <Text className="py-10 text-center text-sm text-danger">
          Couldn’t load this Job’s stock. Pull down to retry.
        </Text>
      </StoresScreen>
    );
  }

  const { items, job } = jobStock.data;
  const leftovers = items.filter((item) => item.drawnQuantity > 0);
  // Cancellation ends a Job's stock life its own way, so only a live completed Job closes out here.
  const isCloseable = job.closedOutAt === null && job.cancelledAt === null && job.completedOn !== null;

  return (
    <StoresScreen
      helpTopic="inventoryCloseOut"
      onBack={() => router.dismissTo('/equipment/stores/close-out')}
      parentLabel="Close-out queue"
      subtitle={job.code}
      title={job.displayName}
    >
      <View className="gap-2">
        <Text className="text-[11px] text-muted-foreground" mono>
          STILL OUT ON THIS JOB
        </Text>
        {leftovers.length === 0 ? (
          <Text className="py-4 text-sm text-muted-foreground">Nothing is still out. This Job is ready to close.</Text>
        ) : (
          <View className="gap-2">
            {leftovers.map((row) => (
              <LeftoverRow
                key={row.partId}
                // Carries the Job through, so a leftover is returned without re-finding the Job the
                // storeman is already standing in — that re-search is what makes return-and-close
                // read as two errands instead of one (spec §3).
                onReturn={() =>
                  router.push({
                    params: { jobId, partCode: row.partCode },
                    pathname: '/equipment/stores/parts/[partCode]/return-to-store',
                  })
                }
                row={row}
              />
            ))}
          </View>
        )}
      </View>

      <View className="gap-1.5">
        <Text className="text-[11px] text-muted-foreground" mono>
          NOTE (OPTIONAL)
        </Text>
        <TextInput
          accessibilityLabel="Close-out note"
          multiline
          numberOfLines={3}
          onChangeText={setNote}
          placeholder="Anything the office should know"
          value={note}
        />
      </View>

      {job.closedOutAt !== null ? (
        <Text className="text-sm text-muted-foreground">This Job’s stock life has already ended.</Text>
      ) : !isCloseable ? (
        <Text className="text-sm text-muted-foreground">Only a completed, uncancelled Job can be closed out.</Text>
      ) : actorUserId === null ? (
        <Text className="text-sm text-danger" weight="semibold">
          Choose who is at the tablet before closing this out.
        </Text>
      ) : null}

      <PostButton
        disabled={!isCloseable || actorUserId === null}
        isPending={closeOut.isPending}
        label="Close out this Job"
        onPress={() => {
          if (actorUserId === null) return;
          keepAlive();
          closeOut.mutate({ actorUserId, jobId, note: note.trim() === '' ? null : note.trim() });
        }}
      />
    </StoresScreen>
  );
}

function LeftoverRow({ onReturn, row }: { onReturn: () => void; row: JobStockRow }) {
  return (
    <Pressable
      accessibilityLabel={`Return ${row.partCode}`}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
      onPress={onReturn}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-surface-foreground" mono numberOfLines={1} weight="semibold">
          {row.partCode}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
          {row.partName}
        </Text>
      </View>
      <Text className="shrink-0 text-sm text-surface-foreground" weight="semibold">
        {row.drawnQuantity} {row.unitOfMeasure}
      </Text>
    </Pressable>
  );
}
