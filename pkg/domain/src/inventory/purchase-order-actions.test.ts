import type { PurchaseOrderProgress, PurchaseOrderStatus } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { derivePurchaseOrderActions, type PurchaseOrderActionFacts } from './purchase-order-actions.js';

function facts({
  closedShortAt = null,
  hasAnyMovement = false,
  isEmpty = false,
  progress = 'sent',
  status = 'sent',
}: {
  closedShortAt?: Date | null;
  hasAnyMovement?: boolean;
  isEmpty?: boolean;
  progress?: PurchaseOrderProgress;
  status?: PurchaseOrderStatus;
} = {}): PurchaseOrderActionFacts {
  return { closedShortAt, hasAnyMovement, isEmpty, progress, status };
}

/** The ordinary partial delivery an open order spends most of its life in. */
const partiallyReceived = facts({ hasAnyMovement: true, progress: 'partially-received' });

/**
 * The state that had no exit before the two termination gates were made complements: a line took
 * delivery and sent all of it back as replacement-owed, so the Supplier owes the goods again and the
 * netted projection reads `sent` — while the ledger rows that record the dock visit are still there.
 */
const receivedThenFullyReturned = facts({ hasAnyMovement: true, progress: 'sent' });

describe('derivePurchaseOrderActions', () => {
  describe('a draft', () => {
    const draft = facts({ status: 'draft' });

    it('is edited and sent, and never received against', () => {
      const actions = derivePurchaseOrderActions(draft);

      expect(actions.edit).toEqual({ allowed: true });
      expect(actions.send).toEqual({ allowed: true });
      expect(actions.receive).toEqual({ allowed: false, reason: 'not-sent' });
      expect(actions.amend).toEqual({ allowed: false, reason: 'not-sent' });
      expect(actions.returnToSupplier).toEqual({ allowed: false, reason: 'not-sent' });
      expect(actions.fileDocuments).toEqual({ allowed: false, reason: 'not-sent' });
    });

    it('is cancelled while nothing has moved against it', () => {
      expect(derivePurchaseOrderActions(draft).cancel).toEqual({ allowed: true });
    });

    it('refuses to be sent with no lines on it', () => {
      expect(derivePurchaseOrderActions(facts({ isEmpty: true, status: 'draft' })).send).toEqual({
        allowed: false,
        reason: 'empty',
      });
    });

    it('has no remainder to close short of', () => {
      expect(derivePurchaseOrderActions(draft).closeShort).toEqual({ allowed: false, reason: 'not-sent' });
    });
  });

  describe('a sent order', () => {
    it('is received against, amended, returned from, and takes the Supplier paperwork', () => {
      const actions = derivePurchaseOrderActions(partiallyReceived);

      expect(actions.receive).toEqual({ allowed: true });
      expect(actions.amend).toEqual({ allowed: true });
      expect(actions.returnToSupplier).toEqual({ allowed: true });
      expect(actions.fileDocuments).toEqual({ allowed: true });
    });

    it('is no longer edited or sent again', () => {
      const actions = derivePurchaseOrderActions(partiallyReceived);

      expect(actions.edit).toEqual({ allowed: false, reason: 'not-draft' });
      expect(actions.send).toEqual({ allowed: false, reason: 'not-draft' });
    });

    it('is closed short once it has history and something is still owed', () => {
      expect(derivePurchaseOrderActions(partiallyReceived).closeShort).toEqual({ allowed: true });
    });

    it('cannot be closed short while the ledger has never touched it', () => {
      expect(derivePurchaseOrderActions(facts()).closeShort).toEqual({ allowed: false, reason: 'nothing-received' });
    });

    it('cannot be closed short once every line is full', () => {
      expect(derivePurchaseOrderActions(facts({ hasAnyMovement: true, progress: 'received' })).closeShort).toEqual({
        allowed: false,
        reason: 'fully-received',
      });
    });

    it('cannot be cancelled once anything has moved against it', () => {
      expect(derivePurchaseOrderActions(partiallyReceived).cancel).toEqual({
        allowed: false,
        reason: 'has-movements',
      });
    });

    it('is still cancelled while the dock has never touched it', () => {
      expect(derivePurchaseOrderActions(facts()).cancel).toEqual({ allowed: true });
    });
  });

  /**
   * The invariant the two gates exist to keep: exactly one of them is open on any live order, so
   * none can be stranded. Cancel and close-short read the same history fact from opposite sides.
   */
  describe('the two ways out are complements', () => {
    it('offers close short, not cancel, to an order whose receipts all went back', () => {
      const actions = derivePurchaseOrderActions(receivedThenFullyReturned);

      expect(actions.closeShort).toEqual({ allowed: true });
      expect(actions.cancel).toEqual({ allowed: false, reason: 'has-movements' });
    });

    it('offers cancel, not close short, to an order nothing has moved against', () => {
      const actions = derivePurchaseOrderActions(facts());

      expect(actions.cancel).toEqual({ allowed: true });
      expect(actions.closeShort).toEqual({ allowed: false, reason: 'nothing-received' });
    });

    it('never refuses both for want of history, whatever the remainder', () => {
      for (const progress of ['sent', 'partially-received', 'received'] as const) {
        for (const hasAnyMovement of [true, false]) {
          const { cancel, closeShort } = derivePurchaseOrderActions(facts({ hasAnyMovement, progress }));

          // The one pairing that would strand an order. A fully received order does refuse both,
          // but close-short refuses it for want of a remainder — which cancelling is the answer to.
          expect(
            !cancel.allowed &&
              cancel.reason === 'has-movements' &&
              !closeShort.allowed &&
              closeShort.reason === 'nothing-received',
          ).toBe(false);
        }
      }
    });
  });

  describe('a closed-short order', () => {
    const closedShort = facts({
      closedShortAt: new Date('2026-08-01T00:00:00.000Z'),
      hasAnyMovement: true,
      progress: 'partially-received',
    });

    it('takes nothing further in and no amendments', () => {
      const actions = derivePurchaseOrderActions(closedShort);

      expect(actions.receive).toEqual({ allowed: false, reason: 'closed-short' });
      expect(actions.amend).toEqual({ allowed: false, reason: 'closed-short' });
    });

    it('says it is already closed short rather than refusing the reason it was asked', () => {
      expect(derivePurchaseOrderActions(closedShort).closeShort).toEqual({
        allowed: false,
        reason: 'already-closed-short',
      });
    });

    it('still sends stock back and still takes the Supplier paperwork', () => {
      const actions = derivePurchaseOrderActions(closedShort);

      expect(actions.returnToSupplier).toEqual({ allowed: true });
      expect(actions.fileDocuments).toEqual({ allowed: true });
    });
  });

  describe('a cancelled order', () => {
    it('does nothing further at all', () => {
      const actions = derivePurchaseOrderActions(facts({ status: 'cancelled' }));

      expect(actions.cancel).toEqual({ allowed: false, reason: 'cancelled' });
      expect(actions.edit).toEqual({ allowed: false, reason: 'not-draft' });
      expect(actions.send).toEqual({ allowed: false, reason: 'not-draft' });
      expect(actions.receive).toEqual({ allowed: false, reason: 'not-sent' });
      expect(actions.closeShort).toEqual({ allowed: false, reason: 'not-sent' });
      expect(actions.returnToSupplier).toEqual({ allowed: false, reason: 'not-sent' });
    });
  });
});
