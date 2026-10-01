import { ReadingValue } from '@pkg/schema/contracting';

/**
 * Everything the capture form decides, so the Save button and save() share one predicate. The server
 * judges the capture; the form only stops what it already knows the server would refuse.
 */
export function deriveCapture({
  value,
  latest,
  disputePrevious,
  disputedReadingId,
  comment,
  commentRequired,
  canCapture,
  machineKnown,
  cameraOpen,
}: {
  value: string;
  /** The served latest reading, or null while the ledger is empty or history is loading. */
  latest: { id: string; value: number } | null;
  disputePrevious: boolean;
  disputedReadingId: string | null;
  comment: string;
  commentRequired: boolean;
  canCapture: boolean;
  machineKnown: boolean;
  cameraOpen: boolean;
}) {
  const parsed = value.trim() ? ReadingValue.safeParse(Number(value.replace(',', '.'))) : null;
  const below = !!parsed?.success && latest !== null && parsed.data < latest.value;
  const disputeConfirmed = below && disputePrevious && disputedReadingId === latest?.id;
  const missingComment = commentRequired && comment.trim() === '';
  const canSave =
    !!parsed?.success && (!below || disputeConfirmed) && !missingComment && canCapture && machineKnown && !cameraOpen;
  return { parsed, below, disputeConfirmed, missingComment, canSave };
}
