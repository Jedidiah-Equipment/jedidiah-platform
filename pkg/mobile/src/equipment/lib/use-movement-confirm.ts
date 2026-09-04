import type { StockMovementWarningCode } from '@pkg/schema/equipment';
import { useState } from 'react';

/**
 * The pause between keying a movement and posting it. A clean movement posts on the first tap; one
 * the ledger would flag holds, shows what it found, and posts on the second — so the shop floor sees
 * the warning at the moment it can still act on it rather than only in the receipt afterwards.
 *
 * What the operator agreed to goes to the post outcome, which reports only what the post adds on
 * top of it: the facts can move under a shared device between the preview and the write.
 */
export function useMovementConfirm({ acknowledge }: { acknowledge: (warnings: StockMovementWarningCode[]) => void }) {
  const [pending, setPending] = useState<{ post: () => void; warnings: StockMovementWarningCode[] } | null>(null);

  return {
    cancel: () => setPending(null),
    confirm: () => {
      if (!pending) return;

      acknowledge(pending.warnings);
      pending.post();
      setPending(null);
    },
    pendingWarnings: pending?.warnings ?? [],
    submit: ({ post, warnings }: { post: () => void; warnings: readonly StockMovementWarningCode[] }) => {
      if (warnings.length === 0) {
        acknowledge([]);
        post();

        return;
      }

      setPending({ post, warnings: [...warnings] });
    },
  };
}
