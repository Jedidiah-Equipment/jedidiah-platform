import type { StockCountBucketVariance, StockOnHandRow } from '@pkg/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useAppToast } from '@/components/ui/toast';
import { useMovementActorUserId, useStoresActor } from '@/equipment/lib/stores-actor';
import { invalidateQueryCache } from '@/lib/query-client';
import { useTRPC } from '@/lib/trpc';

import { PostButton } from './PostButton';
import { QuantityField } from './QuantityField';
import { StoresConfirmModal } from './StoresConfirmModal';
import { NoActorNotice } from './StoresPartScreen';

type CountEntry = { key: string; lengthMm: number | null; observed: string };

/** The single bucket a discrete or measured Part has, keyed the way the observed map keys it. */
const SINGLE_BUCKET = 'single';

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
  // Keyed figures live in a map and the fields are derived from `row`, rather than the fields being
  // seeded into state once. That is what lets a refetch — the one that follows a refused post —
  // bring a newly arrived length onto the screen without discarding what has already been counted.
  const [observedByBucket, setObservedByBucket] = useState<Record<string, string>>({});
  const [addedLengths, setAddedLengths] = useState<number[]>([]);
  const [addedLength, setAddedLength] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const entries = countEntries(row, addedLengths, observedByBucket);

  const postCount = useMutation(
    trpc.inventory.postStockCount.mutationOptions({
      onError: async (error) => {
        setIsReviewing(false);
        toast('error', error.message);
        // The refusal this screen can actually reach is "a bucket arrived while you were counting",
        // so the useful next step is the fresh stock position — the reload puts the bucket the
        // server complained about on screen with a field to key it into.
        await invalidateQueryCache(queryClient);
      },
      onSuccess: async (result) => {
        await invalidateQueryCache(queryClient);
        setIsReviewing(false);
        toast('success', describePostedVariance(result.buckets));
        onCounted();
      },
    }),
  );

  const keyed = entries.flatMap((entry) => {
    const observed = parseCount(entry.observed);

    return observed === null ? [] : [{ lengthMm: entry.lengthMm, observed }];
  });
  /**
   * A count covers the whole Part, so a bucket left blank is a bucket walked past and found empty —
   * the server would write it off whether or not the tablet said so. Spelling those out here is what
   * keeps the review honest: the biggest correction of the shift is usually a length nobody keyed,
   * and a review built only from the filled fields would post it unseen.
   */
  const impliedEmpty = row.buckets.flatMap((bucket) =>
    bucket.quantity !== 0 && !keyed.some((entry) => entry.lengthMm === bucket.lengthMm)
      ? [{ lengthMm: bucket.lengthMm, observed: 0 }]
      : [],
  );
  const counted = [...keyed, ...impliedEmpty];
  const isKeyingValid = entries.every((entry) => entry.observed.trim() === '' || parseCount(entry.observed) !== null);
  const canReview = keyed.length > 0 && isKeyingValid;

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
              setObservedByBucket((current) => ({ ...current, [entry.key]: value }));
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
                setAddedLengths((current) => [...current, lengthMm]);
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

      <StoresConfirmModal
        cancelLabel="Recount"
        confirmLabel="Post count"
        isPending={postCount.isPending}
        onCancel={() => setIsReviewing(false)}
        onConfirm={() => {
          if (actorUserId === null) return;
          postCount.mutate({ actorUserId, buckets: counted, partId: row.partId, sessionId });
        }}
        open={isReviewing}
        title={row.partCode}
      >
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
          {impliedEmpty.length === 0
            ? 'Posting records the difference. Recount first if this does not look right.'
            : 'Lengths you did not key are recorded as empty. Posting records the difference — recount first if this does not look right.'}
        </Text>
      </StoresConfirmModal>
    </View>
  );
}

/**
 * The buckets to ask about: the lengths the ledger already knows, the Part's standard purchase
 * length, and any offcut length the counter has added. A discrete or measured Part is one question
 * with no length at all.
 */
function countEntries(
  row: StockOnHandRow,
  addedLengths: readonly number[],
  observedByBucket: Record<string, string>,
): CountEntry[] {
  if (row.unitOfMeasure !== 'mm') {
    return [{ key: SINGLE_BUCKET, lengthMm: null, observed: observedByBucket[SINGLE_BUCKET] ?? '' }];
  }

  const lengths = [
    ...new Set([
      ...row.buckets.flatMap((bucket) => (bucket.lengthMm === null ? [] : [bucket.lengthMm])),
      ...(row.standardPurchaseLengthMm === null ? [] : [row.standardPurchaseLengthMm]),
      ...addedLengths,
    ]),
  ].sort((left, right) => left - right);

  return lengths.map((lengthMm) => ({
    key: String(lengthMm),
    lengthMm,
    observed: observedByBucket[String(lengthMm)] ?? '',
  }));
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
