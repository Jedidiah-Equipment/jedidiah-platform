import { unacknowledgedWarnings, warningMessageFor } from '@pkg/domain/equipment';
import type { StockMovementWarningCode } from '@pkg/schema/equipment';
import { useRef } from 'react';
import { toast } from 'sonner';

/**
 * The two halves of "shown both before the post and on it", for a dialog that previews a movement.
 * The preview itself is the caller's — it holds the facts — but what the operator agreed to, and
 * what the post added on top of it, are the same everywhere, so they live here rather than being
 * re-typed beside every submit.
 */
export function useMovementWarnings() {
  const acknowledged = useRef<readonly StockMovementWarningCode[]>([]);

  return {
    /** Call as the post is submitted: what the operator saw and chose to post anyway. */
    acknowledge(warnings: readonly StockMovementWarningCode[]): void {
      acknowledged.current = warnings;
    },
    /**
     * Call with the post's own verdict. Only what the preview missed is raised — the facts can move
     * between the two, and repeating what was already confirmed teaches Stores to dismiss warnings.
     */
    reconcile(posted: readonly StockMovementWarningCode[]): void {
      for (const code of unacknowledgedWarnings({ acknowledged: acknowledged.current, posted })) {
        toast.warning(warningMessageFor(code));
      }
    },
  };
}
