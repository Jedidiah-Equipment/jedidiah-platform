import type { StockCountBucketVariance, StockOnHandRow } from '@pkg/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { ThemedModal } from '@/components/ui/themed-modal';
import { useAppToast } from '@/components/ui/toast';
import { invalidateQueryCache } from '@/lib/query-client';
import { useMovementActorUserId, useStoresActor } from '@/lib/stores-actor';
import { useTRPC } from '@/lib/trpc';

import { PostButton } from './PostButton';
import { QuantityField } from './QuantityField';
import { NoActorNotice } from './StoresPartScreen';

type CountEntry = { key: string; lengthMm: number | null; observed: string };

/**
 * Blind entry, then informed review (spec §9).
 *
 * The Part's stock on hand is already loaded — the tablet needs its length buckets to know what to
 * ask about — and the whole discipline of this screen is that it does not *show* it until a number
 * has been keyed. Nothing here is enforced by the server: hiding a figure is a screen's job, and a
 * server that refused to send it would break every other stores screen that legitimately shows it.
 *
 * The review is client-side and the post happens once, on confirm. That is what "one-tap recount"
 * means here: a recount is a second look before anything is written, not an undo — the ledger is
 * append-only, and a count posted twice would leave two corrections nobody can tell apart.
 */
export function StockCountPanel({
  onCounted,
  row,
  sessionId,
}: {
  onCounted: () => void;
  row: StockOnHandRow;
  sessionId: string;
}) {
  const trpc = useTRPC();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const actorUserId = useMovementActorUserId();
  const { keepAlive } = useStoresActor();
  const isLinear = row.unitOfMeasure === 'mm';
  const [entries, setEntries] = useState<CountEntry[]>(() => seedEntries(row));
  const [addedLength, setAddedLength] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const postCount = useMutation(
    trpc.inventory.postStockCount.mutationOptions({
      onError: (error) => {
        setIsReviewing(false);
        toast('error', error.message);
      },
      onSuccess: async (result) => {
        await invalidateQueryCache(queryClient);
        setIsReviewing(false);
        toast('success', describePostedVariance(result.buckets));
        onCounted();
      },
    }),
  );

  const counted = entries.flatMap((entry) => {
    const observed = parseCount(entry.observed);

    return observed === null ? [] : [{ lengthMm: entry.lengthMm, observed }];
  });
  const isKeyingValid = entries.every((entry) => entry.observed.trim() === '' || parseCount(entry.observed) !== null);
  const canReview = counted.length > 0 && isKeyingValid;

  return (
    <View className="gap-5">
      <View className="gap-3">
        <Text className="text-[11px] text-muted-foreground" mono>
          {isLinear ? 'COUNT THE PIECES ON THE RACK, PER LENGTH' : 'COUNT WHAT IS IN THE BIN'}
        </Text>
        {entries.map((entry) => (
          <QuantityField
            key={entry.key}
            label={entry.lengthMm === null ? 'Counted' : `Counted at ${entry.lengthMm} mm`}
            onChange={(value) => {
              keepAlive();
              setEntries((current) =>
                current.map((item) => (item.key === entry.key ? { ...item, observed: value } : item)),
              );
            }}
            placeholder="0"
            unit={entry.lengthMm === null ? row.unitOfMeasure : undefined}
            value={entry.observed}
          />
        ))}
      </View>

      {/* An offcut nobody has recorded a bucket for is still stock standing on the rack. */}
      {isLinear ? (
        <View className="gap-1.5">
          <Text className="text-[11px] text-muted-foreground" mono>
            A LENGTH THAT IS NOT LISTED
          </Text>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <TextInput
                accessibilityLabel="Another length in millimetres"
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={setAddedLength}
                placeholder="Length in mm"
                value={addedLength}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              className="rounded-xl border border-border bg-surface px-4 py-3"
              onPress={() => {
                const lengthMm = parseLength(addedLength);
                if (lengthMm === null || entries.some((entry) => entry.lengthMm === lengthMm)) return;
                keepAlive();
                setEntries((current) => [...current, { key: String(lengthMm), lengthMm, observed: '' }]);
                setAddedLength('');
              }}
            >
              <Text className="text-base text-surface-foreground" weight="semibold">
                Add
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <NoActorNotice actorUserId={actorUserId} />

      <PostButton
        disabled={!canReview || actorUserId === null}
        isPending={postCount.isPending}
        label="Check this count"
        onPress={() => {
          keepAlive();
          setIsReviewing(true);
        }}
      />

      <ThemedModal backdropLabel="Keep counting" onClose={() => setIsReviewing(false)} open={isReviewing}>
        <View className="w-full max-w-[520px] gap-4 rounded-2xl border border-border bg-surface p-5">
          <Text className="text-xl text-surface-foreground" weight="bold">
            {row.partCode}
          </Text>
          <View className="gap-2">
            {counted.map((bucket) => {
              const expected = expectedFor(row, bucket.lengthMm);

              return (
                <View className="flex-row items-baseline justify-between gap-3" key={bucket.lengthMm ?? 'single'}>
                  <Text className="text-base text-muted-foreground">
                    {bucket.lengthMm === null ? 'On the shelf' : `${bucket.lengthMm} mm`}
                  </Text>
                  <Text className="text-base text-surface-foreground" weight="semibold">
                    {`expected ${expected} · counted ${bucket.observed}`}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text className="text-sm text-muted-foreground">
            Posting records the difference. Recount first if this does not look right.
          </Text>
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              className="flex-1 items-center rounded-xl border border-border px-4 py-3"
              onPress={() => setIsReviewing(false)}
            >
              <Text className="text-base text-surface-foreground" weight="semibold">
                Recount
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: postCount.isPending }}
              className={`flex-1 items-center rounded-xl bg-primary px-4 py-3 ${postCount.isPending ? 'opacity-40' : ''}`}
              disabled={postCount.isPending}
              onPress={() => {
                if (actorUserId === null) return;
                postCount.mutate({ actorUserId, buckets: counted, partId: row.partId, sessionId });
              }}
            >
              <Text className="text-base text-primary-foreground" weight="bold">
                Post count
              </Text>
            </Pressable>
          </View>
        </View>
      </ThemedModal>
    </View>
  );
}

/**
 * The buckets to ask about: the lengths the ledger already knows, plus the Part's standard purchase
 * length. A discrete or measured Part is one question with no length at all.
 */
function seedEntries(row: StockOnHandRow): CountEntry[] {
  if (row.unitOfMeasure !== 'mm') return [{ key: 'single', lengthMm: null, observed: '' }];

  const lengths = [
    ...new Set([
      ...row.buckets.flatMap((bucket) => (bucket.lengthMm === null ? [] : [bucket.lengthMm])),
      ...(row.standardPurchaseLengthMm === null ? [] : [row.standardPurchaseLengthMm]),
    ]),
  ].sort((left, right) => left - right);

  return lengths.map((lengthMm) => ({ key: String(lengthMm), lengthMm, observed: '' }));
}

function expectedFor(row: StockOnHandRow, lengthMm: number | null): number {
  return row.buckets.find((bucket) => bucket.lengthMm === lengthMm)?.quantity ?? 0;
}

/** Zero is a real count — an empty bin — so this accepts it where `parseQuantity` deliberately does not. */
function parseCount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseLength(value: string): number | null {
  const parsed = Number(value.trim());

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function describePostedVariance(buckets: readonly StockCountBucketVariance[]): string {
  const delta = buckets.reduce((total, bucket) => total + bucket.delta, 0);

  if (delta === 0) return 'Counted — it matched';

  return `Counted — ${delta > 0 ? '+' : ''}${delta} posted`;
}
