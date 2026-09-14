import { deriveMovementWarnings } from '@pkg/domain/equipment';
import type {
  InventoryRecipientOption,
  JobPickerOption,
  JobStockMovementType,
  SourceCheckoutOption,
  StockOnHandRow,
} from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type RefObject, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { previewJobMovementWarnings } from '@/equipment/lib/movement-preview';
import { useStoresActor } from '@/equipment/lib/stores-actor';
import { resolveStoresMovementParent } from '@/equipment/lib/toolbar-navigation';
import { useMovementConfirm } from '@/equipment/lib/use-movement-confirm';
import { useStoresPostOutcome } from '@/equipment/lib/use-stores-post';
import { useTRPC } from '@/lib/trpc';

import { JobPicker, type JobPickerHandle } from './JobPicker';
import { canPostStoresMovement, switchStoresMovementTarget, toStoresMovementInput } from './job-movement-model';
import { LengthBucketField } from './LengthBucketField';
import { MovementWarningModal } from './MovementWarningModal';
import { PostButton } from './PostButton';
import { hasRequiredLength, parseQuantity, QuantityField } from './QuantityField';
import { RecipientPicker } from './RecipientPicker';
import { SourceCheckoutPicker } from './SourceCheckoutPicker';
import { NoActorNotice, StoresPartScreen } from './StoresPartScreen';

/**
 * Checkout and return-to-store, which are the same screen twice: pick the Job, key the quantity,
 * and for linear stock say which length off the rack. The direction only changes the wording and
 * the procedure called.
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
  const [mode, setMode] = useState<'job' | 'person'>('job');
  const [job, setJob] = useState<JobPickerOption | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [recipient, setRecipient] = useState<InventoryRecipientOption | null>(actor);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [purpose, setPurpose] = useState('');
  const [sourceCheckout, setSourceCheckout] = useState<SourceCheckoutOption | null>(null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [quantity, setQuantity] = useState('');
  // Null means "nobody has touched the length yet", which is what lets the standard purchase length
  // stand as the default without an effect that would then fight a deliberate clear.
  const [keyedLengthMm, setKeyedLengthMm] = useState<string | null>(null);

  const isCheckout = movementType === 'checkout';
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
  const isLinear = row.unitOfMeasure === 'mm';
  // A full stick is what usually leaves the rack, so the Part's standard purchase length opens the
  // length question. Unlike a receipt, a Job movement has no server-side fallback for it.
  const lengthMm = keyedLengthMm ?? (row.standardPurchaseLengthMm === null ? '' : String(row.standardPurchaseLengthMm));
  const parsedQuantity = parseQuantity(quantity);
  const parsedLength = isLinear ? parseQuantity(lengthMm) : null;
  const jobIdToPost = fixedJobId ?? job?.id ?? null;
  const needsLength = mode === 'job' || isCheckout;
  const hasLength = !needsLength || hasRequiredLength({ isLinear, lengthMm: parsedLength });
  const hasTarget =
    mode === 'job'
      ? jobIdToPost !== null
      : isCheckout
        ? recipient !== null && purpose.trim() !== ''
        : sourceCheckout !== null;
  const canPost = canPostStoresMovement({ actorUserId, hasLength, hasTarget, quantity: parsedQuantity });

  // The facts this movement is judged against, served by the same read the Job's stock tab uses.
  const jobStockQuery = useQuery(
    trpc.inventory.jobStock.queryOptions(
      { jobId: jobIdToPost ?? '' },
      { enabled: mode === 'job' && jobIdToPost !== null },
    ),
  );
  const previewWarnings =
    parsedQuantity === null
      ? []
      : mode === 'job'
        ? previewJobMovementWarnings({
            jobStock: jobStockQuery.data,
            lengthMm: parsedLength,
            movementType,
            quantity: parsedQuantity,
            row,
          })
        : isCheckout
          ? deriveMovementWarnings({
              facts: {
                bucketQuantityOnHand: row.buckets.find((bucket) => bucket.lengthMm === parsedLength)?.quantity ?? 0,
                kind: 'checkout-without-job',
              },
              quantity: parsedQuantity,
            })
          : sourceCheckout === null
            ? []
            : deriveMovementWarnings({
                facts: {
                  kind: 'return-without-job',
                  outstandingQuantity: Math.max(0, sourceCheckout.quantity - sourceCheckout.returnedQuantity),
                },
                quantity: parsedQuantity,
              });

  return (
    <>
      {fixedJobId === undefined ? (
        <View className="gap-1.5">
          <Text className="text-[11px] text-muted-foreground" mono>
            MOVEMENT TARGET
          </Text>
          <View className="flex-row gap-2">
            {(['job', 'person'] as const).map((targetMode) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === targetMode }}
                className={`flex-1 items-center rounded-xl border px-3 py-3 ${mode === targetMode ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}
                key={targetMode}
                onPress={() => {
                  const targetState = switchStoresMovementTarget({
                    actor,
                    currentMode: mode,
                    isCheckout,
                    state: { job, jobSearch, purpose, recipient, sourceCheckout },
                    targetMode,
                  });
                  setMode(targetMode);
                  setJob(targetState.job);
                  setJobSearch(targetState.jobSearch);
                  setPurpose(targetState.purpose);
                  setRecipient(targetState.recipient);
                  setSourceCheckout(targetState.sourceCheckout);
                }}
              >
                <Text className="text-sm text-surface-foreground" weight="semibold">
                  {targetMode === 'job' ? 'To a Job' : 'Without a Job'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-1.5 rounded-xl border border-border bg-surface px-3 py-3">
        <Text className="text-[11px] text-muted-foreground" mono>
          OPERATOR
        </Text>
        <Text className="text-base text-surface-foreground" weight="semibold">
          {actor?.name ?? 'Nobody selected'}
        </Text>
      </View>

      {mode === 'job' && fixedJobId === undefined ? (
        <JobPicker
          movementType={movementType}
          onSearchChange={setJobSearch}
          onSelect={setJob}
          ref={jobPickerRef}
          search={jobSearch}
          selected={job}
        />
      ) : mode === 'person' && isCheckout ? (
        <>
          <RecipientPicker
            onSearchChange={setRecipientSearch}
            onSelect={setRecipient}
            search={recipientSearch}
            selected={recipient}
          />
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground" mono>
              PURPOSE
            </Text>
            <TextInput
              accessibilityLabel="Purpose"
              onChangeText={setPurpose}
              placeholder="Repair factory drill"
              textSize="toolbar"
              value={purpose}
            />
          </View>
        </>
      ) : mode === 'person' ? (
        <SourceCheckoutPicker
          onSearchChange={setSourceSearch}
          onSelect={setSourceCheckout}
          partId={row.partId}
          search={sourceSearch}
          selected={sourceCheckout}
        />
      ) : null}

      <QuantityField
        label="Quantity"
        onChange={setQuantity}
        placeholder="0"
        unit={row.unitOfMeasure}
        value={quantity}
      />

      {needsLength && isLinear ? (
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
              const inputFacts = {
                actorUserId,
                jobId: jobIdToPost,
                lengthMm: parsedLength,
                mode,
                partId: row.partId,
                purpose,
                quantity: parsedQuantity,
                recipientUserId: recipient?.id ?? null,
                sourceCheckoutId: sourceCheckout?.id ?? null,
              };
              if (isCheckout) checkoutMutation.mutate(toStoresMovementInput({ ...inputFacts, isCheckout: true }));
              else returnMutation.mutate(toStoresMovementInput({ ...inputFacts, isCheckout: false }));
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
