import { STOCKTAKE_SCOPE_LABELS, type StocktakeOverdueRow, StocktakeScope, type StocktakeSession } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { StoresScreen } from '@/equipment/components/stores/StoresScreen';
import { useMovementActorUserId, useStoresActor } from '@/equipment/lib/stores-actor';
import { invalidateQueryCache } from '@/lib/query-client';
import { useTRPC } from '@/lib/trpc';

/**
 * The two standing rhythms, each with one button: resume the walk in progress, or start the next
 * one (spec §9). Raw material is walked in one sitting; stores rolls over days, which is why
 * resuming is the ordinary case rather than the exception.
 */
export default function StoresStocktakeRoute() {
  const trpc = useTRPC();
  const router = useRouter();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const actorUserId = useMovementActorUserId();
  const { keepAlive } = useStoresActor();
  const sessions = useQuery(trpc.inventory.stocktakeSessions.queryOptions());
  const overdue = useQuery(trpc.inventory.stocktakeOverdue.queryOptions());

  const openSession = useMutation(
    trpc.inventory.openStocktakeSession.mutationOptions({
      onError: (error) => toast('error', error.message),
      onSuccess: async (session) => {
        await invalidateQueryCache(queryClient);
        router.push({ params: { sessionId: session.id }, pathname: '/equipment/stores/stocktake/[sessionId]' });
      },
    }),
  );

  return (
    <StoresScreen
      helpTopic="inventoryStocktake"
      onBack={() => router.dismissTo('/equipment/stores')}
      parentLabel="Stores"
      subtitle="COUNT THE SHELF"
      title="Stocktake"
    >
      {sessions.isPending ? (
        <View className="items-center py-10">
          <ActivityIndicator accessibilityLabel="Loading stocktake sessions" size="large" />
        </View>
      ) : sessions.isError ? (
        <Text className="py-10 text-center text-sm text-danger">Couldn’t load the sessions. Pull down to retry.</Text>
      ) : (
        <View className="gap-3">
          {StocktakeScope.options.map((scope) => (
            <ScopeTile
              disabled={actorUserId === null || openSession.isPending}
              key={scope}
              onOpen={() => {
                if (actorUserId === null) return;
                keepAlive();
                openSession.mutate({ actorUserId, scope });
              }}
              onResume={(sessionId) =>
                router.push({ params: { sessionId }, pathname: '/equipment/stores/stocktake/[sessionId]' })
              }
              openSession={sessions.data.items.find((item) => item.scope === scope && item.closedAt === null) ?? null}
              overdue={overdue.data?.items.find((item) => item.scope === scope) ?? null}
              scope={scope}
            />
          ))}
        </View>
      )}

      {actorUserId === null ? (
        <Text className="text-sm text-danger" weight="semibold">
          Choose who is at the tablet before opening a count.
        </Text>
      ) : null}
    </StoresScreen>
  );
}

function ScopeTile({
  disabled,
  onOpen,
  onResume,
  openSession,
  overdue,
  scope,
}: {
  disabled: boolean;
  onOpen: () => void;
  onResume: (sessionId: string) => void;
  openSession: StocktakeSession | null;
  overdue: StocktakeOverdueRow | null;
  scope: StocktakeScope;
}) {
  const isOpen = openSession !== null;

  return (
    <Pressable
      accessibilityLabel={`${isOpen ? 'Resume' : 'Open'} the ${STOCKTAKE_SCOPE_LABELS[scope]} count`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !isOpen && disabled }}
      className={`gap-1 rounded-2xl border border-border bg-surface px-4 py-4 ${!isOpen && disabled ? 'opacity-40' : ''}`}
      disabled={!isOpen && disabled}
      onPress={() => (openSession ? onResume(openSession.id) : onOpen())}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-base text-surface-foreground" weight="semibold">
          {STOCKTAKE_SCOPE_LABELS[scope]}
        </Text>
        <Text className={`text-sm ${overdue?.isOverdue ? 'text-danger' : 'text-muted-foreground'}`} weight="semibold">
          {overdue?.isOverdue ? 'Overdue' : 'On time'}
        </Text>
      </View>
      <Text className="text-sm text-muted-foreground">
        {isOpen
          ? `Open · ${openSession.countedPartCount} Parts counted so far. Tap to carry on.`
          : 'Tap to open a new count.'}
      </Text>
    </Pressable>
  );
}
