import { deriveMovementWarnings } from '@pkg/domain/equipment';
import type {
  InventoryQuoteOption,
  JobPickerOption,
  JobStockMovementType,
  JobStockResult,
  PostCheckoutInput,
  PostReturnToStoreInput,
  QuickSwitchActor,
  QuoteStockResult,
  SourceCheckoutOption,
  StockMovementWarningCode,
  StockOnHandRow,
} from '@pkg/schema/equipment';
import {
  PostCheckoutInput as PostCheckoutInputSchema,
  PostReturnToStoreInput as PostReturnToStoreInputSchema,
} from '@pkg/schema/equipment';

import { bucketQuantityOnHand, previewJobMovementWarnings } from '@/equipment/lib/movement-preview';

/**
 * Who the tablet is posting to, or returning from, holding whatever that target has chosen so far.
 * A Job or a Parts Sale runs either direction; a Recipient is only ever drawn to, and a source
 * Checkout only ever returned from.
 */
export type StoresMovementTarget =
  | { job: JobPickerOption | null; kind: 'job' }
  | { kind: 'quote'; quote: InventoryQuoteOption | null }
  | { kind: 'recipient'; purpose: string; recipient: QuickSwitchActor | null }
  | { kind: 'source'; sourceCheckout: SourceCheckoutOption | null };

/**
 * The three tiles the screen offers: a Job, a Parts Sale, or Without a Job — which target the last
 * is depends on the direction.
 */
export type StoresMovementMode = 'job' | 'quote' | 'person';

export function storesMovementMode(target: StoresMovementTarget): StoresMovementMode {
  switch (target.kind) {
    case 'job':
    case 'quote':
      return target.kind;
    case 'recipient':
    case 'source':
      return 'person';
  }
}

/** Where a mode starts. Switching never carries a hidden selection across: the other target's choice is gone. */
export function initialStoresMovementTarget({
  actor,
  mode,
  movementType,
}: {
  actor: QuickSwitchActor | null;
  mode: StoresMovementMode;
  movementType: JobStockMovementType;
}): StoresMovementTarget {
  if (mode === 'job') return { job: null, kind: 'job' };
  if (mode === 'quote') return { kind: 'quote', quote: null };

  return movementType === 'checkout'
    ? { kind: 'recipient', purpose: '', recipient: actor }
    : { kind: 'source', sourceCheckout: null };
}

/** Follows Quick Switch only while the recipient is still the previous operator's default. */
export function syncDefaultRecipient({
  actor,
  previousActorUserId,
  target,
}: {
  actor: QuickSwitchActor | null;
  previousActorUserId: string | null;
  target: StoresMovementTarget;
}): StoresMovementTarget {
  if (target.kind !== 'recipient') return target;
  if (target.recipient !== null && target.recipient.id !== previousActorUserId) return target;

  return { ...target, recipient: actor };
}

export function hasStoresMovementTarget(target: StoresMovementTarget, fixedJobId: string | undefined): boolean {
  switch (target.kind) {
    case 'job':
      return fixedJobId !== undefined || target.job !== null;
    case 'quote':
      return target.quote !== null;
    case 'recipient':
      return target.recipient !== null && target.purpose.trim() !== '';
    case 'source':
      return target.sourceCheckout !== null;
  }
}

/** A source-linked return inherits its length from the Checkout, so the tablet has nothing to ask. */
export function storesMovementNeedsLength(target: StoresMovementTarget): boolean {
  return target.kind !== 'source';
}

/** The ledger's judgement of what is about to post, against the facts the showing target carries. */
export function previewStoresMovementWarnings({
  jobStock,
  lengthMm,
  movementType,
  quantity,
  quoteStock,
  row,
  target,
}: {
  jobStock: JobStockResult | undefined;
  lengthMm: number | null;
  movementType: JobStockMovementType;
  quantity: number | null;
  quoteStock: QuoteStockResult | undefined;
  row: StockOnHandRow;
  target: StoresMovementTarget;
}): StockMovementWarningCode[] {
  if (quantity === null) return [];

  switch (target.kind) {
    case 'job':
      return previewJobMovementWarnings({ jobStock, lengthMm, movementType, quantity, row });
    case 'quote': {
      if (movementType === 'checkout') return previewRackOnlyCheckout(row, lengthMm, quantity);
      // Silent until the sale's stock arrives: every figure would read zero and warn on any return.
      if (quoteStock === undefined) return [];
      const partStock = quoteStock.items.find((item) => item.partId === row.partId);

      return deriveMovementWarnings({
        facts: {
          drawnBucketQuantity:
            lengthMm === null
              ? (partStock?.drawnQuantity ?? 0)
              : (partStock?.lengthBuckets.find((bucket) => bucket.lengthMm === lengthMm)?.drawnQuantity ?? 0),
          kind: 'return-to-store',
        },
        quantity,
      });
    }
    case 'recipient':
      return previewRackOnlyCheckout(row, lengthMm, quantity);
    case 'source':
      if (target.sourceCheckout === null) return [];

      return deriveMovementWarnings({
        facts: {
          drawnBucketQuantity: target.sourceCheckout.quantity - target.sourceCheckout.returnedQuantity,
          kind: 'return-to-store',
        },
        quantity,
      });
  }
}

/** No Job, so nothing planned the draw: a CFO of zero is what "no CFO" means to the judgement. */
function previewRackOnlyCheckout(
  row: StockOnHandRow,
  lengthMm: number | null,
  quantity: number,
): StockMovementWarningCode[] {
  return deriveMovementWarnings({
    facts: {
      bucketQuantityOnHand: bucketQuantityOnHand(row, lengthMm),
      cfoQuantity: 0,
      drawnQuantity: 0,
      kind: 'checkout',
    },
    quantity,
  });
}

type StoresMovementFacts = {
  actorUserId: string;
  fixedJobId: string | undefined;
  lengthMm: number | null;
  partId: string;
  quantity: number;
  target: StoresMovementTarget;
};

/** The one strict payload the showing target maps to; the schema refuses a target that does not fit the direction. */
export function toStoresMovementInput(facts: StoresMovementFacts & { movementType: 'checkout' }): PostCheckoutInput;
export function toStoresMovementInput(
  facts: StoresMovementFacts & { movementType: 'return-to-store' },
): PostReturnToStoreInput;
export function toStoresMovementInput({
  actorUserId,
  fixedJobId,
  lengthMm,
  movementType,
  partId,
  quantity,
  target,
}: StoresMovementFacts & { movementType: JobStockMovementType }): PostCheckoutInput | PostReturnToStoreInput {
  switch (target.kind) {
    case 'job': {
      const input = { actorUserId, jobId: fixedJobId ?? target.job?.id, lengthMm, partId, quantity };

      return movementType === 'checkout'
        ? PostCheckoutInputSchema.parse(input)
        : PostReturnToStoreInputSchema.parse(input);
    }
    case 'quote': {
      const input = { actorUserId, lengthMm, partId, quantity, quoteId: target.quote?.id };

      return movementType === 'checkout'
        ? PostCheckoutInputSchema.parse(input)
        : PostReturnToStoreInputSchema.parse(input);
    }
    case 'recipient':
      return PostCheckoutInputSchema.parse({
        actorUserId,
        lengthMm,
        note: target.purpose,
        partId,
        quantity,
        recipientUserId: target.recipient?.id,
      });
    case 'source':
      return PostReturnToStoreInputSchema.parse({ actorUserId, quantity, sourceCheckoutId: target.sourceCheckout?.id });
  }
}
