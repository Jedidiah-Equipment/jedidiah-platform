import { z } from 'zod';

/**
 * Why an action a Part cannot take is refused. These are the Part's own facts, not messages: the
 * server maps each back to the error it already raised, and a surface reads it to say why a control
 * is dead instead of offering one the post would refuse.
 */
export type PartStockActionBlockedReason = z.infer<typeof PartStockActionBlockedReason>;
export const PartStockActionBlockedReason = z.enum([
  /** A bought Part is made by nobody here, so nothing can be produced into it. */
  'not-built',
  /** Between counts a periodic Part's stock on hand is deliberately stale, so only a count corrects it. */
  'periodic',
  /** Linear stock is counted in whole pieces per length, which a Build event posts no rows for. */
  'linear',
  /** A Built Part's cost is derived from what its build consumed, never asserted against it. */
  'cost-derived',
  /** A Built Part has no Supplier, so it can never sit on a Purchase Order line. */
  'built-part',
]);

export type PartStockActionVerdict = z.infer<typeof PartStockActionVerdict>;
export const PartStockActionVerdict = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }),
  z.object({ allowed: z.literal(false), reason: PartStockActionBlockedReason }),
]);

/**
 * What this Part may be asked to do, derived from its own stored facts and never stored itself —
 * the same answer the server's write gates read. It judges the *Part*, so a check that judges an
 * input instead (an adjustment reason, a unit cost, a bucket a count left unnamed) stays with the
 * write that reads that input, and a check that judges a Stocktake Session's scope stays with the
 * session. Purchase Order Actions judges the *order*, so a surface offers a receive when the Part
 * allows it *and* the order allows it. Permissions are a third seam, as they already are there.
 */
export type PartStockActions = z.infer<typeof PartStockActions>;
export const PartStockActions = z.object({
  /**
   * Always allowed today: which reasons a Part will take, and whether a cost may ride the movement,
   * judge the adjustment rather than the Part. Carried so a surface iterates one contract.
   */
  adjust: PartStockActionVerdict,
  build: PartStockActionVerdict,
  checkout: PartStockActionVerdict,
  /** Always allowed today: scope membership is the open session's question, not the Part's. */
  count: PartStockActionVerdict,
  /** Whether the Part can sit on a Purchase Order line at all — what the buy list ticks. */
  purchase: PartStockActionVerdict,
  receive: PartStockActionVerdict,
  returnToStore: PartStockActionVerdict,
  returnToSupplier: PartStockActionVerdict,
  revalue: PartStockActionVerdict,
});
