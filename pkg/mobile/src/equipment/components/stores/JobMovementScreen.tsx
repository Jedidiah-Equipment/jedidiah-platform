import type { JobStockMovementType, StockOnHandRow } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useStoresActor } from '@/equipment/lib/stores-actor';
import { resolveStoresMovementParent } from '@/equipment/lib/toolbar-navigation';
import { useMovementConfirm } from '@/equipment/lib/use-movement-confirm';
import { useStoresPostOutcome } from '@/equipment/lib/use-stores-post';
import { useTRPC } from '@/lib/trpc';

import { JobPicker, type JobPickerHandle } from './JobPicker';
import {
  hasStoresMovementTarget,
  initialStoresMovementTarget,
  previewStoresMovementWarnings,
  type StoresMovementMode,
  type StoresMovementTarget,
  storesMovementMode,
  storesMovementNeedsLength,
  syncDefaultRecipient,
  toStoresMovementInput,
} from './job-movement-model';
import { LengthBucketField } from './LengthBucketField';
import { MovementWarningModal } from './MovementWarningModal';
import { PostButton } from './PostButton';
import { hasRequiredLength, parseQuantity, QuantityField } from './QuantityField';
import { QuotePicker } from './QuotePicker';
import { RecipientPicker } from './RecipientPicker';
import { SourceCheckoutPicker } from './SourceCheckoutPicker';
import { NoActorNotice, StoresPartScreen } from './StoresPartScreen';

const MODE_LABELS: Record<StoresMovementMode, string> = {
  job: 'To a Job',
  person: 'Without a Job',
  quote: 'To a Parts Sale',
};

/**
 * Checkout and return-to-store, which are the same screen twice: pick the target, key the quantity,
 * and for linear stock say which length off the rack. The direction only changes the wording, the
 * procedure called, and what Without a Job means — a person to draw to, or a Checkout to return.
 */
export function JobMovementScreen({
  jobId,
  movementType,
  parent,
  partCode,
}: {
  /** Pre-selects the Job when the return was reached from that Job's close-out. */
  jobId?: string;
  movementType: JobStockMovementType;
  parent?: { label: string; onBack: () => void };
  partCode: string;
}) {
  const isCheckout = movementType === 'checkout';
  const jobPicker = useRef<JobPickerHandle>(null);

  return (
    <StoresPartScreen
      onNearScrollEnd={() => jobPicker.current?.loadMore()}
      parent={parent}
      partCode={partCode}
      title={isCheckout ? 'Check out stock' : 'Return to store'}
    >
      {(row) => <JobMovementForm fixedJobId={jobId} jobPickerRef={jobPicker} movementType={movementType} row={row} />}
    </StoresPartScreen>
  );
}

function JobMovementForm({
  fixedJobId,
  jobPickerRef,
  movementType,
  row,
}: {
  fixedJobId: string | undefined;
  jobPickerRef: RefObject<JobPickerHandle | null>;
  movementType: JobStockMovementType;
  row: StockOnHandRow;
}) {
  const trpc = useTRPC();
  const { actor } = useStoresActor();
  const actorUserId = actor?.id ?? null;
  const [target, setTarget] = useState<StoresMovementTarget>(() =>
    initialStoresMovementTarget({ actor, mode: 'job', movementType }),
  );
  // One search box shows at a time, so one search string serves whichever picker the target is on.
  const [search, setSearch] = useState('');
  const previousActorUserId = useRef(actor?.id ?? null);
  const [quantity, setQuantity] = useState('');
  // Null means "nobody has touched the length yet", which is what lets the standard purchase length
  // stand as the default without an effect that would then fight a deliberate clear.
  const [keyedLengthMm, setKeyedLengthMm] = useState<string | null>(null);

  const isCheckout = movementType === 'checkout';
  const mode = storesMovementMode(target);

  useEffect(() => {
    const previousId = previousActorUserId.current;
    previousActorUserId.current = actor?.id ?? null;
    setTarget((current) => syncDefaultRecipient({ actor, previousActorUserId: previousId, target: current }));
  }, [actor]);

  const returnTo = resolveStoresMovementParent({ jobId: fixedJobId, partCode: row.partCode }).returnTo;
  const outcome = useStoresPostOutcome({
    returnTo,
    successMessage: isCheckout ? 'Stock checked out' : 'Stock returned to store',
  });
  const checkoutMutation = useMutation(
    trpc.inventory.postCheckout.mutationOptions({ onError: outcome.onError, onSuccess: outcome.onSuccess }),
  );
  const returnMutation = useMutation(
    trpc.inventory.postReturnToStore.mutationOptions({ onError: outcome.onError, onSuccess: outcome.onSuccess }),
  );

  const confirmFlow = useMovementConfirm({ acknowledge: outcome.acknowledge });
  const isLinear = row.unitOfMeasure === 'mm' && storesMovementNeedsLength(target);
  // A full stick is what usually leaves the rack, so the Part's standard purchase length opens the
  // length question. Unlike a receipt, a Job movement has no server-side fallback for it.
  const lengthMm = keyedLengthMm ?? (row.standardPurchaseLengthMm === null ? '' : String(row.standardPurchaseLengthMm));
  const parsedQuantity = parseQuantity(quantity);
  const parsedLength = isLinear ? parseQuantity(lengthMm) : null;
  const jobIdToPost = target.kind === 'job' ? (fixedJobId ?? target.job?.id ?? null) : null;
  // A Parts Sale checkout judges against the rack alone; only its return needs what the sale still holds.
  const quoteIdToJudge = target.kind === 'quote' && !isCheckout ? (target.quote?.id ?? null) : null;
  const canPost =
    actorUserId !== null &&
    parsedQuantity !== null &&
    hasRequiredLength({ isLinear, lengthMm: parsedLength }) &&
    hasStoresMovementTarget(target, fixedJobId);

  // The facts this movement is judged against, served by the same read the Job's stock tab uses.
  const jobStockQuery = useQuery(
    trpc.inventory.jobStock.queryOptions({ jobId: jobIdToPost ?? '' }, { enabled: jobIdToPost !== null }),
  );
  const quoteStockQuery = useQuery(
    trpc.inventory.quoteStock.queryOptions({ quoteId: quoteIdToJudge ?? '' }, { enabled: quoteIdToJudge !== null }),
  );
  const previewWarnings = previewStoresMovementWarnings({
    jobStock: jobStockQuery.data,
    lengthMm: parsedLength,
    movementType,
    quantity: parsedQuantity,
    quoteStock: quoteStockQuery.data,
    row,
    target,
  });

  return (
    <>
      {fixedJobId === undefined ? (
        <View className="gap-1.5">
          <Text className="text-[11px] text-muted-foreground" mono>
            MOVEMENT TARGET
          </Text>
          <View className="flex-row gap-2">
            {(['job', 'quote', 'person'] as const).map((candidate) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === candidate }}
                className={`flex-1 items-center rounded-xl border px-3 py-3 ${mode === candidate ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}
                key={candidate}
                onPress={() => {
                  setTarget(initialStoresMovementTarget({ actor, mode: candidate, movementType }));
                  setSearch('');
                }}
              >
                <Text className="text-center text-sm text-surface-foreground" weight="semibold">
                  {MODE_LABELS[candidate]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {mode === 'person' ? (
        <View className="gap-1.5 rounded-xl border border-border bg-surface px-3 py-3">
          <Text className="text-[11px] text-muted-foreground" mono>
            OPERATOR
          </Text>
          <Text className="text-base text-surface-foreground" weight="semibold">
            {actor?.name ?? 'Nobody selected'}
          </Text>
        </View>
      ) : null}

      {target.kind === 'job' ? (
        fixedJobId === undefined ? (
          <JobPicker
            movementType={movementType}
            onSearchChange={setSearch}
            onSelect={(job) => setTarget({ job, kind: 'job' })}
            ref={jobPickerRef}
            search={search}
            selected={target.job}
          />
        ) : null
      ) : target.kind === 'quote' ? (
        <QuotePicker
          movementType={movementType}
          onSearchChange={setSearch}
          onSelect={(quote) => setTarget({ kind: 'quote', quote })}
          search={search}
          selected={target.quote}
        />
      ) : target.kind === 'recipient' ? (
        <>
          <RecipientPicker
            onSearchChange={setSearch}
            onSelect={(recipient) => setTarget({ ...target, recipient })}
            search={search}
            selected={target.recipient}
          />
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground" mono>
              PURPOSE
            </Text>
            <TextInput
              accessibilityLabel="Purpose"
              onChangeText={(purpose) => setTarget({ ...target, purpose })}
              placeholder="Repair factory drill"
              textSize="toolbar"
              value={target.purpose}
            />
          </View>
        </>
      ) : target.kind === 'source' ? (
        <SourceCheckoutPicker
          onSearchChange={setSearch}
          onSelect={(sourceCheckout) => setTarget({ kind: 'source', sourceCheckout })}
          partId={row.partId}
          search={search}
          selected={target.sourceCheckout}
        />
      ) : null}

      <QuantityField
        label="Quantity"
        onChange={setQuantity}
        placeholder="0"
        unit={row.unitOfMeasure}
        value={quantity}
      />

      {isLinear ? (
        <LengthBucketField
          buckets={row.buckets}
          onChange={setKeyedLengthMm}
          standardPurchaseLengthMm={row.standardPurchaseLengthMm}
          value={lengthMm}
        />
      ) : null}

      <NoActorNotice actorUserId={actorUserId} />

      <PostButton
        disabled={!canPost}
        isPending={checkoutMutation.isPending || returnMutation.isPending}
        label={isCheckout ? 'Check out stock' : 'Return stock'}
        onPress={() => {
          if (parsedQuantity === null || actorUserId === null) return;

          confirmFlow.submit({
            post: () => {
              const facts = {
                actorUserId,
                fixedJobId,
                lengthMm: parsedLength,
                partId: row.partId,
                quantity: parsedQuantity,
                target,
              };
              if (movementType === 'checkout')
                checkoutMutation.mutate(toStoresMovementInput({ ...facts, movementType }));
              else returnMutation.mutate(toStoresMovementInput({ ...facts, movementType }));
            },
            warnings: previewWarnings,
          });
        }}
      />

      <MovementWarningModal
        mode="confirm"
        onClose={confirmFlow.cancel}
        onConfirm={confirmFlow.confirm}
        warnings={confirmFlow.pendingWarnings}
      />
      <MovementWarningModal mode="posted" onClose={outcome.acknowledgeWarnings} warnings={outcome.warnings} />
    </>
  );
}
