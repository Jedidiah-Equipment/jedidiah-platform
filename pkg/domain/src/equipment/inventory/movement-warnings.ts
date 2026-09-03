import type { StockMovementWarningCode } from '@pkg/schema';
import { type BuildBomComponent, type BuildWarningLine, deriveBuildComponentWarnings } from './build.js';

/** The stock facts a Job movement is judged against, all scoped to one Job, Part and length bucket. */
export type JobMovementFacts = {
  /** Stock on hand for this Part and length bucket, before the movement. */
  bucketQuantityOnHand: number;
  /**
   * CFO demand for this Job and Part, summed across its assemblies. Zero means the Job never
   * planned this Part at all — a custom Job has no CFO, and a Unit-bound one can still be drawn
   * off it — because a CFO line's quantity is constrained positive.
   */
  cfoQuantity: number;
  /** Net drawn for this Job, Part and length bucket — the quantity a return can reverse. */
  drawnBucketQuantity: number;
  /** Net drawn for this Job and Part across every length bucket. */
  drawnQuantity: number;
};

/**
 * Everything a movement is judged against, one arm per kind. These are *served* facts: the server
 * derives them from the ledger and carries them on the reads a surface previews from, so a preview
 * adds the keyed quantity to them rather than re-deriving a threshold of its own. That re-derivation
 * is what let three surfaces disagree about what a Purchase Order line could still send back.
 */
export type StockMovementFacts =
  | (JobMovementFacts & { kind: 'checkout' | 'return-to-store' })
  | { kind: 'receipt'; orderedQuantity: number; receivedQuantity: number }
  | {
      kind: 'return-to-supplier';
      /**
       * Received on this line *and length bucket*, less what has already gone back — the quantity a
       * return can reverse. Bucket-scoped because a return names a length: judging it against
       * another length's receipts is the mistake the ledger's own pool has never made.
       */
      outstandingReceivedQuantity: number;
    }
  | { bom: readonly BuildBomComponent[]; kind: 'build'; lines: readonly BuildWarningLine[] };

/**
 * The one judgement of whether a movement is worth flagging, read by the surfaces that preview it
 * and by the ledger services that post it. Warnings never block (spec §3): a draw may exceed the
 * CFO, take stock negative, or return more than a Job drew, and all three still post.
 *
 * Judged once means one derivation on both sides of the seam, not one judgement in time — the post
 * re-judges under its lock against facts that may have moved, and stays authoritative.
 */
export function deriveMovementWarnings({
  facts,
  quantity,
}: {
  facts: StockMovementFacts;
  /** What is being posted now; for a build, the number of units being built. */
  quantity: number;
}): StockMovementWarningCode[] {
  switch (facts.kind) {
    case 'build':
      // Flattened and de-duplicated: a confirm prompt asks about the build, while the post keeps the
      // per-component attribution its result carries.
      return [...new Set(deriveBuildComponentWarnings({ ...facts, quantity }).flatMap((warning) => warning.codes))];
    case 'checkout': {
      const warnings: StockMovementWarningCode[] = [];
      // Only a Job that planned this Part can be drawn past its plan. Off-CFO draws are valid, and
      // saying "exceeds the CFO" where there is no CFO trains Stores to dismiss the warning that counts.
      if (facts.cfoQuantity > 0 && facts.drawnQuantity + quantity > facts.cfoQuantity) warnings.push('exceeds-cfo');
      if (facts.bucketQuantityOnHand - quantity < 0) warnings.push('negative-stock-on-hand');

      return warnings;
    }
    case 'receipt':
      // Over-receipt warns and posts (spec §4) — the supplier sent what it sent, and the ledger has
      // to say so. A delivery refused at the dock never reaches here, because nothing is posted.
      return facts.receivedQuantity + quantity > facts.orderedQuantity ? ['exceeds-ordered'] : [];
    case 'return-to-store':
      // A return puts stock back, so it can never call the rack short.
      return quantity > facts.drawnBucketQuantity ? ['exceeds-drawn'] : [];
    case 'return-to-supplier':
      // Sending back more than the line took in is almost always a scan error, so it earns a loud
      // confirm — and then posts anyway. The stock physically left; refusing the row would hide it.
      return quantity > facts.outstandingReceivedQuantity ? ['exceeds-received'] : [];
  }
}

/**
 * What the post said that the operator had not already agreed to. A preview judges served facts,
 * which can move before the post takes its lock, so the two can differ honestly — and only the
 * difference is worth interrupting someone for. A warning the preview raised and the post did not
 * is silence, not a correction: what they confirmed simply did not happen.
 */
export function unacknowledgedWarnings({
  acknowledged,
  posted,
}: {
  /** What the operator confirmed before posting; empty where a surface offered no preview. */
  acknowledged: readonly StockMovementWarningCode[];
  posted: readonly StockMovementWarningCode[];
}): StockMovementWarningCode[] {
  return posted.filter((code) => !acknowledged.includes(code));
}

/**
 * What each warning says to the person about to post, or who just did. Shared so the browser, the
 * Stores Tablet's preview and its post-side notice cannot describe the same verdict differently —
 * they were three copies of this table before the judgement was shared.
 */
export const stockMovementWarningMessages = {
  'bom-deviation': 'This differs from what the BOM calls for.',
  'exceeds-cfo': 'This draw exceeds the Job CFO.',
  'exceeds-drawn': 'This return exceeds the quantity currently drawn.',
  'exceeds-ordered': 'This receipt takes the line past the quantity ordered.',
  'exceeds-received': 'This return sends back more than the line ever received.',
  'negative-stock-on-hand': 'This draw will take stock on hand negative.',
} as const satisfies Record<StockMovementWarningCode, string>;

export function warningMessageFor(code: StockMovementWarningCode): string {
  return stockMovementWarningMessages[code];
}
