import { STOCKTAKE_SCOPE_LABELS, type StocktakeUncountedPart } from '@pkg/schema';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ScanField } from '@/components/stores/ScanField';
import { StockCountPanel } from '@/components/stores/StockCountPanel';
import { StoresConfirmModal } from '@/components/stores/StoresConfirmModal';
import { StoresLoadMoreButton } from '@/components/stores/StoresLoadMoreButton';
import { StoresScreen } from '@/components/stores/StoresScreen';
import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { invalidateQueryCache } from '@/lib/query-client';
import { useMovementActorUserId, useStoresActor } from '@/lib/stores-actor';
import { resolveScan } from '@/lib/stores-scan-resolution';
import { useTRPC } from '@/lib/trpc';
import { usePartByCode } from '@/lib/use-stores-post';

/**
 * The walk itself: scan a bin, key the count, confirm, move on — with the session's uncounted list
 * standing right underneath as the to-do (spec §9).
 *
 * Counting happens *on* this screen rather than through a route per Part. A shift here is dozens of
 * bins in a row, and the list of what is left is the thing a counter navigates by; pushing a screen
 * per Part would take that list away at exactly the moment it is being worked from.
 */
/** How much of the skip list the close dialog names before summarising the rest. */
const SKIP_LIST_PREVIEW = 8;

/**
 * One screenful at a time. The uncounted list starts as long as the scope — a stores walk covers
 * every perpetual Part the plant stocks — and it is re-read after every count, so it is paged
 * rather than held whole. Each page is asked for by tapping, never by scrolling.
 */
const UNCOUNTED_PAGE_SIZE = 20;

export default function StoresStocktakeSessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const trpc = useTRPC();
  const router = useRouter();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const actorUserId = useMovementActorUserId();
  const { keepAlive, selectActor } = useStoresActor();
  const [partCode, setPartCode] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const detail = useQuery(trpc.inventory.stocktakeSession.queryOptions({ sessionId }));
  const uncountedPages = useInfiniteQuery(
    trpc.inventory.stocktakeUncounted.infiniteQueryOptions(
      { limit: UNCOUNTED_PAGE_SIZE, sessionId },
      { getNextPageParam: (page) => page.nextCursor, initialCursor: 0 },
    ),
  );
  const uncounted = useMemo(
    () => uncountedPages.data?.pages.flatMap((page) => page.items) ?? [],
    [uncountedPages.data?.pages],
  );
  const uncountedTotal = uncountedPages.data?.pages.at(-1)?.total ?? 0;

  const closeSession = useMutation(
    trpc.inventory.closeStocktakeSession.mutationOptions({
      onError: (error) => {
        setIsClosing(false);
        toast('error', error.message);
      },
      onSuccess: async () => {
        await invalidateQueryCache(queryClient);
        setIsClosing(false);
        toast('success', 'Stocktake session closed');
        router.dismissTo('/equipment/stores/stocktake');
      },
    }),
  );

  const onScan = async (raw: string) => {
    keepAlive();
    setScanError(null);
    const resolution = await resolveScan({
      fetchActors: () => queryClient.fetchQuery(trpc.inventory.quickSwitchActors.queryOptions()),
      fetchPartByCode: (code) => queryClient.fetchQuery(trpc.inventory.partByCode.queryOptions({ code })),
      raw,
    });

    if (resolution.kind === 'actor') selectActor(resolution.actor);
    if (resolution.kind === 'part') setPartCode(resolution.partCode);
    if (resolution.kind === 'error') setScanError(resolution.message);
  };

  if (detail.isPending) {
    return (
      <StoresScreen
        helpTopic="inventoryStocktake"
        onBack={() => router.dismissTo('/equipment/stores/stocktake')}
        parentLabel="Stocktake"
        subtitle="LOADING THE SESSION"
        title="Stocktake"
      >
        <View className="items-center py-10">
          <ActivityIndicator accessibilityLabel="Loading the session" size="large" />
        </View>
      </StoresScreen>
    );
  }

  if (detail.isError) {
    return (
      <StoresScreen
        helpTopic="inventoryStocktake"
        onBack={() => router.dismissTo('/equipment/stores/stocktake')}
        parentLabel="Stocktake"
        subtitle="SESSION UNAVAILABLE"
        title="Stocktake"
      >
        <Text className="py-10 text-center text-sm text-danger">Couldn’t load this session. Pull down to retry.</Text>
      </StoresScreen>
    );
  }

  const session = detail.data;
  const isClosed = session.closedAt !== null;

  return (
    // Paging is the Load more button and nothing else. Fetching on scroll-end would put this
    // screen's own controls — Close this session, below the list — permanently out of reach: every
    // scroll toward them appends rows and pushes them further down.
    <StoresScreen
      helpTopic="inventoryStocktake"
      onBack={() => router.dismissTo('/equipment/stores/stocktake')}
      parentLabel="Stocktake"
      subtitle={`${session.countedPartCount} COUNTED · ${uncountedTotal} TO GO`}
      title={`${STOCKTAKE_SCOPE_LABELS[session.scope]} count`}
    >
      {isClosed ? (
        <Text className="text-sm text-muted-foreground">
          This session is closed. Open a new one to carry on counting.
        </Text>
      ) : partCode === null ? (
        <View className="gap-3">
          <ScanField
            caption="SCAN THE BIN OR THE ITEM"
            isActive={!isClosing}
            onScan={(raw) => void onScan(raw)}
            placeholder="Scan a Part label"
          />
          {scanError === null ? null : (
            <Text className="text-sm text-danger" weight="semibold">
              {scanError}
            </Text>
          )}
        </View>
      ) : (
        <CountingPart onDone={() => setPartCode(null)} partCode={partCode} sessionId={sessionId} />
      )}

      {isClosed || partCode !== null ? null : (
        <>
          <View className="gap-2">
            <Text className="text-[11px] text-muted-foreground" mono>
              STILL TO COUNT
            </Text>
            {uncountedPages.isPending ? (
              <View className="items-center py-6">
                <ActivityIndicator accessibilityLabel="Loading what is left to count" size="small" />
              </View>
            ) : uncounted.length === 0 ? (
              <Text className="py-4 text-sm text-muted-foreground">
                Everything in scope has been counted. Close the session when you are done.
              </Text>
            ) : (
              <View className="gap-2">
                {uncounted.map((row) => (
                  <UncountedRow key={row.partId} onPress={() => setPartCode(row.partCode)} row={row} />
                ))}
                {uncountedPages.hasNextPage ? (
                  <StoresLoadMoreButton
                    isLoading={uncountedPages.isFetchingNextPage}
                    onPress={() => void uncountedPages.fetchNextPage()}
                  />
                ) : null}
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: actorUserId === null }}
            className={`items-center rounded-2xl border border-border px-4 py-4 ${actorUserId === null ? 'opacity-40' : ''}`}
            disabled={actorUserId === null}
            onPress={() => setIsClosing(true)}
          >
            <Text className="text-base text-surface-foreground" weight="semibold">
              Close this session
            </Text>
          </Pressable>
        </>
      )}

      <StoresConfirmModal
        cancelLabel="Keep counting"
        confirmLabel="Close it"
        isPending={closeSession.isPending}
        onCancel={() => setIsClosing(false)}
        onConfirm={() => {
          if (actorUserId === null) return;
          keepAlive();
          closeSession.mutate({ actorUserId, sessionId });
        }}
        open={isClosing}
        title="Close this session?"
      >
        {/* The skip list is the whole point of the close: whatever is named here goes uncorrected
            until the next walk, and on periodic stock that means a number that stays too high. */}
        <Text className="text-base text-surface-foreground">
          {uncountedTotal === 0
            ? 'Everything in scope was counted.'
            : `${uncountedTotal} ${uncountedTotal === 1 ? 'Part was' : 'Parts were'} skipped:`}
        </Text>
        {uncountedTotal === 0 ? null : (
          <View className="gap-1">
            {uncounted.slice(0, SKIP_LIST_PREVIEW).map((row) => (
              <Text className="text-sm text-muted-foreground" key={row.partId} mono numberOfLines={1}>
                {row.partCode}
              </Text>
            ))}
            {uncountedTotal > SKIP_LIST_PREVIEW ? (
              <Text className="text-sm text-muted-foreground">and {uncountedTotal - SKIP_LIST_PREVIEW} more</Text>
            ) : null}
          </View>
        )}
      </StoresConfirmModal>
    </StoresScreen>
  );
}

function CountingPart({ onDone, partCode, sessionId }: { onDone: () => void; partCode: string; sessionId: string }) {
  const part = usePartByCode(partCode);

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-base text-surface-foreground" mono weight="semibold">
          {partCode}
        </Text>
        <Pressable accessibilityRole="button" onPress={onDone}>
          <Text className="text-sm text-muted-foreground" weight="semibold">
            Pick another
          </Text>
        </Pressable>
      </View>

      {part.isPending ? (
        <View className="items-center py-8">
          <ActivityIndicator accessibilityLabel="Loading Part" size="large" />
        </View>
      ) : part.isError ? (
        <Text className="py-6 text-center text-sm text-danger">Couldn’t load this Part. Scan it again.</Text>
      ) : (
        <>
          <Text className="text-sm text-muted-foreground">{part.data.partName}</Text>
          <StockCountPanel onCounted={onDone} row={part.data} sessionId={sessionId} />
        </>
      )}
    </View>
  );
}

function UncountedRow({ onPress, row }: { onPress: () => void; row: StocktakeUncountedPart }) {
  return (
    <Pressable
      accessibilityLabel={`Count ${row.partCode}`}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
      onPress={onPress}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-surface-foreground" mono numberOfLines={1} weight="semibold">
          {row.partCode}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
          {row.partName}
        </Text>
      </View>
    </Pressable>
  );
}
