import { createGlobalSearchCondition, type Db, withPagination } from '@pkg/db';
import { partCategories, parts, stockMovements } from '@pkg/db/equipment';
import { applyPartCategoryMarkup } from '@pkg/domain/equipment';
import { getNextCursor } from '@pkg/schema';
import type { QuoteInventoryPartListInput, QuoteInventoryPartListResult } from '@pkg/schema/equipment';
import { QuoteInventoryPartListResult as QuoteInventoryPartListResultSchema } from '@pkg/schema/equipment';
import { asc, count, desc, eq, sql } from 'drizzle-orm';

import { loadMovingAverages, onHandDeltaSum, stockOnHandJoin } from '../inventory/ledger.js';
import { loadPlantStockPosition } from '../inventory/plant-stock-position.js';

/**
 * The Parts catalog as a Work Item's "Add inventory part" dialog searches it: every Part, in-stock
 * first, each with a sell price worked out here so that cost and markup never leave the server.
 * The moving average replays each Part's whole ledger, which is why this is one narrow page.
 */
export async function listQuoteInventoryParts({
  db,
  input,
}: {
  db: Db;
  input: QuoteInventoryPartListInput;
}): Promise<QuoteInventoryPartListResult> {
  const where = createGlobalSearchCondition(input.search, [
    sql`${parts.code}`,
    sql`${parts.name}`,
    sql`${partCategories.name}`,
  ]);
  const page = db
    .select({
      averageUtilizationPercent: parts.averageUtilizationPercent,
      code: parts.code,
      id: parts.id,
      markupPercent: partCategories.markupPercent,
      name: parts.name,
      partCategoryName: partCategories.name,
      standardPurchaseLengthMm: parts.standardPurchaseLengthMm,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .innerJoin(partCategories, eq(partCategories.id, parts.categoryId))
    .leftJoin(stockMovements, stockOnHandJoin())
    .where(where)
    .groupBy(parts.id, partCategories.id)
    // On hand, not free: free needs commitments, which are not one SQL sum.
    .orderBy(desc(sql`(${onHandDeltaSum} > 0)`), asc(parts.code), asc(parts.id))
    .$dynamic();
  const countQuery = db
    .select({ total: count() })
    .from(parts)
    .innerJoin(partCategories, eq(partCategories.id, parts.categoryId))
    .where(where);

  const [rows, [counted]] = await Promise.all([withPagination(page, input), countQuery]);
  const total = counted?.total ?? 0;
  const partIds = rows.map((row) => row.id);
  const [averages, plantStock] = await Promise.all([
    loadMovingAverages(db, partIds),
    loadPlantStockPosition({ db, partIds }),
  ]);

  return QuoteInventoryPartListResultSchema.parse({
    items: rows.map(({ markupPercent, ...row }) => {
      const price = applyPartCategoryMarkup({ averageUnitCost: averages.get(row.id) ?? null, markupPercent });

      return {
        ...row,
        freeQuantity: plantStock.freeByPart.get(row.id) ?? 0,
        priceNote: price.reason,
        sellPricePerBasisUnit: price.unitPrice,
      };
    }),
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}
