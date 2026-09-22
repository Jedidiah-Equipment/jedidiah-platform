import type { Db } from '@pkg/db';
import { customers, parts, quotes, stockMovements } from '@pkg/db/equipment';
import { groupBy } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import type { InventoryQuoteOption, PartUnitOfMeasure, QuoteStockResult } from '@pkg/schema/equipment';
import {
  formatQuoteCode,
  InventoryQuoteOption as InventoryQuoteOptionSchema,
  JOB_STOCK_MOVEMENT_TYPES,
  QuoteStockResult as QuoteStockResultSchema,
} from '@pkg/schema/equipment';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { CheckoutQuoteNotFoundError, CheckoutQuoteNotPartsSaleError } from './checkout-errors.js';
import { drawnCostedValueExpression, uncostedDrawnQuantityExpression } from './job-stock-facts.js';
import { toLedgerQuantity } from './ledger.js';
import { inventoryQuoteSelection } from './quote-options-read.js';
import { sumBy } from './row-grouping.js';

/** One Part and length bucket still out against a Parts Sale, net of its returns. */
export type QuoteStockBucket = {
  costedValue: number;
  drawnQuantity: number;
  lengthMm: number | null;
  partCode: string;
  partId: UUID;
  partName: string;
  uncostedDrawnQuantity: number;
  unitOfMeasure: PartUnitOfMeasure;
};

/**
 * What a Parts Sale still has out, grouped the way its returns pool: by Part and length bucket. A
 * bucket returned in full, or past what it drew, holds nothing out and is left off. Shared by the
 * Quote page's Stock drawn panel and the cancel dialog, so the two name the same stock.
 */
export async function loadQuoteStockBuckets(db: Db, quoteId: UUID): Promise<QuoteStockBucket[]> {
  const rows = await db
    .select({
      costedValue: drawnCostedValueExpression,
      drawnQuantity: sql<number>`(-coalesce(sum(${stockMovements.delta}), 0))::double precision`,
      lengthMm: stockMovements.lengthMm,
      partCode: parts.code,
      partId: stockMovements.partId,
      partName: parts.name,
      uncostedDrawnQuantity: uncostedDrawnQuantityExpression,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(stockMovements)
    .innerJoin(parts, eq(parts.id, stockMovements.partId))
    .where(and(eq(stockMovements.quoteId, quoteId), inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES)))
    .groupBy(stockMovements.partId, parts.code, parts.name, parts.unitOfMeasure, stockMovements.lengthMm)
    .orderBy(asc(parts.code), asc(stockMovements.partId), asc(stockMovements.lengthMm));

  return rows
    .map((row) => ({ ...row, drawnQuantity: toLedgerQuantity(row.drawnQuantity) }))
    .filter((row) => row.drawnQuantity > 0);
}

/** One Parts Sale as a stores surface may see it, refusing any other Quote. */
export async function loadInventoryQuote(db: Db, quoteId: UUID): Promise<InventoryQuoteOption> {
  const [quote] = await db
    .select({ ...inventoryQuoteSelection, isPartsSale: quotes.isPartsSale })
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .where(eq(quotes.id, quoteId))
    .limit(1);
  if (!quote) throw new CheckoutQuoteNotFoundError(quoteId);
  if (!quote.isPartsSale) throw new CheckoutQuoteNotPartsSaleError(quoteId);

  return InventoryQuoteOptionSchema.parse({ ...quote, code: formatQuoteCode(quote.code) });
}

/**
 * What a Parts Sale is holding, per Part, at what it left stores for. No CFO, free stock or on-order:
 * nobody decides buying from this panel.
 */
export async function listQuoteStock({ db, quoteId }: { db: Db; quoteId: UUID }): Promise<QuoteStockResult> {
  const quote = await loadInventoryQuote(db, quoteId);
  const buckets = await loadQuoteStockBuckets(db, quoteId);

  return QuoteStockResultSchema.parse({
    items: [...groupBy(buckets, (bucket) => bucket.partId).values()].map(([part, ...tail]) => {
      const partBuckets = [part, ...tail];

      return {
        drawnQuantity: toLedgerQuantity(sumBy(partBuckets, (bucket) => bucket.drawnQuantity)),
        // Unpriced material still out makes the value unknowable rather than quietly smaller.
        drawnValue:
          toLedgerQuantity(sumBy(partBuckets, (bucket) => bucket.uncostedDrawnQuantity)) > 0
            ? null
            : sumBy(partBuckets, (bucket) => bucket.costedValue),
        lengthBuckets: partBuckets.flatMap((bucket) =>
          bucket.lengthMm === null ? [] : [{ drawnQuantity: bucket.drawnQuantity, lengthMm: bucket.lengthMm }],
        ),
        partCode: part.partCode,
        partId: part.partId,
        partName: part.partName,
        unitOfMeasure: part.unitOfMeasure,
      };
    }),
    quote,
  });
}
