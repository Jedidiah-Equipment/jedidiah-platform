import { captureIsBelowLatest } from '@pkg/domain/contracting';
import { ReadingValue } from '@pkg/schema/contracting';

/**
 * Everything the capture form decides, so the Save button and save() share one predicate. The server
 * judges the capture; the form only stops what it already knows the server would refuse.
 */
export function deriveCapture({
  value,
  latest,
  disputedReadingId,
  comment,
  commentRequired,
  canCapture,
  machineKnown,
  cameraOpen,
  futureReadAt,
}: {
  value: string;
  /** The served latest reading, or null while the ledger is empty or history is loading. */
  latest: { id: string; value: number } | null;
  /** The reading the Foreman said is wrong, or null. */
  disputedReadingId: string | null;
  comment: string;
  commentRequired: boolean;
  canCapture: boolean;
  machineKnown: boolean;
  cameraOpen: boolean;
  futureReadAt: boolean;
}) {
  const parsed = value.trim() ? ReadingValue.safeParse(Number(value.replace(',', '.'))) : null;
  const below = !!parsed?.success && captureIsBelowLatest(parsed.data, latest);
  const disputeConfirmed = below && disputedReadingId === latest?.id;
  const canSave =
    !!parsed?.success &&
    (!below || disputeConfirmed) &&
    !(commentRequired && comment.trim() === '') &&
    canCapture &&
    machineKnown &&
    !cameraOpen &&
    !futureReadAt;
  return { parsed, below, disputeConfirmed, canSave };
}
