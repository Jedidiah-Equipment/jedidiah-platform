import type {
  PartStockActionBlockedReason,
  PartStockActions,
  PartStockActionVerdict,
  PartStockTrackingMode,
  PartUnitOfMeasure,
} from '@pkg/schema';
import { unitClassFor } from '@pkg/schema';

/**
 * What every verdict is judged against: the three stored Part facts that decide what may move
 * against it. Deliberately not the Part row, so a caller holding only a stock-on-hand line can ask.
 */
export type PartStockActionFacts = {
  /** A Built Part carries a BOM instead of a Supplier and is made in-house. */
  isInternallyFabricated: boolean;
  stockTrackingMode: PartStockTrackingMode;
  unitOfMeasure: PartUnitOfMeasure;
};

const ALLOWED: PartStockActionVerdict = { allowed: true };

function blocked(reason: PartStockActionBlockedReason): PartStockActionVerdict {
  return { allowed: false, reason };
}

/**
 * The one answer to what a Part may be asked to do, read by the surfaces that offer stock controls
 * and by the server's own write gates. The question was previously asked wherever it came up — three
 * throws in `assertBuildable`, two of them re-derived in the browser's Build filter and the third
 * forgotten, so a linear Built Part was offered a build the post then refused.
 */
export function derivePartStockActions(facts: PartStockActionFacts): PartStockActions {
  const { isInternallyFabricated, stockTrackingMode, unitOfMeasure } = facts;
  const isPeriodic = stockTrackingMode === 'periodic';

  // A Built Part has no Supplier, so it never reaches a Purchase Order line — and receiving and
  // returning are what that line is for. One rule, asked from three directions.
  const whilePurchasable = isInternallyFabricated ? blocked('built-part') : ALLOWED;
  // Between counts a periodic Part's stock on hand is deliberately stale-high, so it takes no
  // consumption at all; a Return to Supplier is excused because it reverses an arrival.
  const whileConsumable = isPeriodic ? blocked('periodic') : ALLOWED;

  return {
    adjust: ALLOWED,
    build: deriveBuildVerdict(),
    checkout: whileConsumable,
    count: ALLOWED,
    purchase: whilePurchasable,
    receive: whilePurchasable,
    returnToStore: whileConsumable,
    returnToSupplier: whilePurchasable,
    // A Built Part's cost is whatever its build consumed, so nothing may assert one against it.
    revalue: isInternallyFabricated ? blocked('cost-derived') : ALLOWED,
  };

  function deriveBuildVerdict(): PartStockActionVerdict {
    // Ordered so the reason names the one fact that could change: a bought Part reads as bought
    // whatever else is true of it, and only a Built Part is judged on how it is stocked.
    if (!isInternallyFabricated) return blocked('not-built');
    if (isPeriodic) return blocked('periodic');
    // A build posts one row at consumed value ÷ units built, which says nothing about which length
    // bucket the stock landed in — so linear stock has no build to post.
    if (unitClassFor(unitOfMeasure) === 'linear') return blocked('linear');

    return ALLOWED;
  }
}
