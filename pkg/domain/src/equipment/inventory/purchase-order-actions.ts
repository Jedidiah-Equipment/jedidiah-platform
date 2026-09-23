import type {
  PurchaseOrderActionBlockedReason,
  PurchaseOrderActions,
  PurchaseOrderActionVerdict,
  PurchaseOrderProgress,
  PurchaseOrderStatus,
} from '@pkg/schema/equipment';
import { derivePurchaseOrderProgress, type PurchaseOrderProgressLine } from './purchase-order-progress.js';

/**
 * What every action verdict is judged against: the two stored facts, whether the order carries any
 * lines, and the ledger facts the termination rules already read — history as rows, remainder as the
 * netted projection. Deliberately not the lines themselves: the caller has already reduced them, and
 * a verdict that re-derived the reduction would be a second opinion on the same question.
 */
export type PurchaseOrderActionFacts = {
  closedShortAt: Date | string | null;
  /** Any ledger row or Arrival against the order — its history exists. */
  hasAnyMovement: boolean;
  /** An order with no lines describes nothing, so it cannot go out. */
  isEmpty: boolean;
  progress: PurchaseOrderProgress;
  status: PurchaseOrderStatus;
};

/**
 * The facts a verdict is judged on, reduced from what a read or a gate has already loaded: the order's
 * stored state, every one of its lines, and what each line has taken in. The one reduction both the
 * served verdict and the write gates use, so they cannot disagree.
 */
export function purchaseOrderActionFacts({
  row,
  lines,
  intake,
}: {
  row: { closedShortAt: Date | string | null; status: PurchaseOrderStatus };
  lines: readonly PurchaseOrderProgressLine[];
  intake: ReadonlyMap<string, number>;
}): PurchaseOrderActionFacts {
  return {
    closedShortAt: row.closedShortAt,
    // History is the rows, never the netted quantity: a line whose receipts all went back still moved.
    hasAnyMovement: lines.some((line) => intake.has(line.id)),
    isEmpty: lines.length === 0,
    progress: derivePurchaseOrderProgress({ lines, receivedByLineId: intake }),
    status: row.status,
  };
}

const ALLOWED: PurchaseOrderActionVerdict = { allowed: true };

function blocked(reason: PurchaseOrderActionBlockedReason): PurchaseOrderActionVerdict {
  return { allowed: false, reason };
}

/**
 * The one answer to what a Purchase Order may be asked to do, read by the payload every surface
 * renders its controls from and by the server's own write gates. The question was previously asked
 * in three vocabularies — raw `status` here, `derivedStatus` there, a line filter on the tablet —
 * and they disagreed, most visibly on an order whose receipts had all gone back as replacement-owed
 * returns: it offered a Cancel button the post then refused.
 */
export function derivePurchaseOrderActions(facts: PurchaseOrderActionFacts): PurchaseOrderActions {
  const { closedShortAt, hasAnyMovement, isEmpty, progress, status } = facts;
  const isSent = status === 'sent';
  const isClosedShort = closedShortAt !== null;

  const whileSentAndOpen = (): PurchaseOrderActionVerdict => {
    if (!isSent) return blocked('not-sent');
    if (isClosedShort) return blocked('closed-short');

    return ALLOWED;
  };

  return {
    amend: whileSentAndOpen(),
    approve: status !== 'draft' ? blocked('not-draft') : isEmpty ? blocked('empty') : ALLOWED,
    // Cancel and close-short read the same history fact from opposite sides, so no live order can
    // refuse both for want of it: an order with rows is closed short, one without is cancelled.
    cancel: status === 'cancelled' ? blocked('cancelled') : hasAnyMovement ? blocked('has-movements') : ALLOWED,
    closeShort: deriveCloseShort(),
    edit: status === 'draft' ? ALLOWED : blocked('not-draft'),
    // A Supplier bills and credits what it sent, so the paperwork follows the order out of the door
    // and keeps arriving after its remainder is released.
    fileDocuments: isSent ? ALLOWED : blocked('not-sent'),
    // What goes to the Supplier is rendered live until sending saves it; from then on the saved copy
    // is the order, and a fresh render would show amendments the Supplier was sent as revisions.
    preview:
      status === 'cancelled' ? blocked('cancelled') : isSent ? blocked('sent') : isEmpty ? blocked('empty') : ALLOWED,
    receive: whileSentAndOpen(),
    // Deliberately outlives close-short: releasing a remainder says nothing more is coming, not that
    // what already arrived can never go back.
    returnToSupplier: isSent ? ALLOWED : blocked('not-sent'),
    // Approval locked the draft, so this audited un-approve is the one route back into editing —
    // an edit never silently revokes a sign-off.
    revertToDraft: status === 'approved' ? ALLOWED : blocked('not-approved'),
    // Approval is what a send now asserts; the emptiness check survives because an approved order
    // can be reverted, emptied, and re-approved only through a draft that has lines.
    send: status !== 'approved' ? blocked('not-approved') : isEmpty ? blocked('empty') : ALLOWED,
  };

  function deriveCloseShort(): PurchaseOrderActionVerdict {
    if (!isSent) return blocked('not-sent');
    if (isClosedShort) return blocked('already-closed-short');
    // Two conditions that are not the same one: history to close short *of*, and a remainder to
    // release. History is the rows and never the netted quantity — an order whose receipts all went
    // back as replacement-owed is owed everything again and reads `sent`, but it has rows, so this
    // is the route that retires it when the replacement is never coming.
    if (!hasAnyMovement) return blocked('nothing-received');
    if (progress === 'received') return blocked('fully-received');

    return ALLOWED;
  }
}
