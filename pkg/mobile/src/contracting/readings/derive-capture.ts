import { ReadingValue } from '@pkg/schema/contracting';

/** Everything the capture form decides from its inputs, so the Save button and save() share one predicate. */
export function deriveCapture({
  value,
  latest,
  latestId,
  disputePrevious,
  disputedReadingId,
  canCapture,
  machineKnown,
  cameraOpen,
}: {
  value: string;
  latest: number | undefined;
  latestId: string | null;
  disputePrevious: boolean;
  disputedReadingId: string | null;
  canCapture: boolean;
  machineKnown: boolean;
  cameraOpen: boolean;
}) {
  const parsed = value.trim() ? ReadingValue.safeParse(Number(value.replace(',', '.'))) : null;
  const below = !!parsed?.success && latest !== undefined && parsed.data < latest;
  const disputeConfirmed = disputePrevious && disputedReadingId === latestId;
  const canSave = !!parsed?.success && (!below || disputeConfirmed) && canCapture && machineKnown && !cameraOpen;
  return { parsed, below, disputeConfirmed, canSave };
}
