import type { InventoryJobOption, JobStockMovementType, StockOnHandRow } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useMovementActorUserId } from '@/lib/stores-actor';
import { resolveStoresMovementParent } from '@/lib/toolbar-navigation';
import { useTRPC } from '@/lib/trpc';
import { useStoresPostOutcome } from '@/lib/use-stores-post';

import { JobPicker } from './JobPicker';
import { LengthBucketField } from './LengthBucketField';
import { MovementWarningModal } from './MovementWarningModal';
import { PostButton } from './PostButton';
import { hasRequiredLength, parseQuantity, QuantityField } from './QuantityField';
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

  return (
    <StoresPartScreen parent={parent} partCode={partCode} title={isCheckout ? 'Check out to a Job' : 'Return to store'}>
      {(row) => <JobMovementForm fixedJobId={jobId} movementType={movementType} row={row} />}
    </StoresPartScreen>
  );
}

function JobMovementForm({
  fixedJobId,
  movementType,
  row,
}: {
  fixedJobId: string | undefined;
  movementType: JobStockMovementType;
  row: StockOnHandRow;
}) {
  const trpc = useTRPC();
  const actorUserId = useMovementActorUserId();
  const [job, setJob] = useState<InventoryJobOption | null>(null);
  const [jobSearch, setJobSearch] = useState('');
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
  const mutation = useMutation(
    (isCheckout ? trpc.inventory.postCheckout : trpc.inventory.postReturnToStore).mutationOptions({
      onError: outcome.onError,
      onSuccess: outcome.onSuccess,
    }),
  );

  const isLinear = row.unitOfMeasure === 'mm';
  // A full stick is what usually leaves the rack, so the Part's standard purchase length opens the
  // length question. Unlike a receipt, a Job movement has no server-side fallback for it.
  const lengthMm = keyedLengthMm ?? (row.standardPurchaseLengthMm === null ? '' : String(row.standardPurchaseLengthMm));
  const parsedQuantity = parseQuantity(quantity);
  const parsedLength = isLinear ? parseQuantity(lengthMm) : null;
  const jobIdToPost = fixedJobId ?? job?.id ?? null;
  const canPost =
    parsedQuantity !== null && jobIdToPost !== null && hasRequiredLength({ isLinear, lengthMm: parsedLength });

  return (
    <>
      {fixedJobId === undefined ? (
        <JobPicker onSearchChange={setJobSearch} onSelect={setJob} search={jobSearch} selected={job} />
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
        disabled={!canPost || actorUserId === null}
        isPending={mutation.isPending}
        label={isCheckout ? 'Check out stock' : 'Return stock'}
        onPress={() => {
          if (parsedQuantity === null || jobIdToPost === null || actorUserId === null) return;

          mutation.mutate({
            actorUserId,
            jobId: jobIdToPost,
            lengthMm: parsedLength,
            partId: row.partId,
            quantity: parsedQuantity,
          });
        }}
      />

      <MovementWarningModal onClose={outcome.acknowledgeWarnings} warnings={outcome.warnings} />
    </>
  );
}
