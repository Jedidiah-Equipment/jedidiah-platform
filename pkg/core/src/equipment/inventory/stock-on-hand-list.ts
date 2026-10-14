import { createGlobalSearchCondition, type Db, withPagination } from '@pkg/db';
import { parts } from '@pkg/db/equipment';
import { getNextCursor } from '@pkg/schema';
import { StockOnHandListInput, type StockOnHandListResult, type StockOnHandRow } from '@pkg/schema/equipment';
import { asc, desc, sql } from 'drizzle-orm';
import { listStockOnHandSnapshot } from './stock-movement-service.js';

export async function listStockOnHand({
  db,
  input = StockOnHandListInput.parse({ limit: 0 }),
}: {
  db: Db;
  input?: StockOnHandListInput;
}): Promise<StockOnHandListResult> {
  return db.transaction(
    async (tx) => {
      const where = createGlobalSearchCondition(input.search, [sql`${parts.name}`, sql`${parts.code}`]);
      const direction = input.sortDirection === 'desc' ? desc : asc;
      const query = tx
        .select({ id: parts.id })
        .from(parts)
        .where(where)
        .orderBy(direction(parts.name), direction(parts.code), asc(parts.id))
        .$dynamic();
      // The normal Part sort pages before replaying stock history. Derived sorts need the matching
      // stock facts first, but still return only the requested page and sort across all matches.
      const [selected, total] = await Promise.all([
        input.sortBy === 'part' ? withPagination(query, input) : query,
        tx.$count(parts, where),
      ]);
      const snapshot = await listStockOnHandSnapshot(
        tx,
        selected.map((part) => part.id),
      );
      const byId = new Map(snapshot.items.map((row) => [row.partId, row]));
      let items = selected.flatMap((part) => {
        const row = byId.get(part.id);
        return row ? [row] : [];
      });
      if (input.sortBy !== 'part') {
        const sortBy = input.sortBy;
        items.sort((left, right) => {
          const a = sortValue(left, sortBy);
          const b = sortValue(right, sortBy);
          if (a === b) return left.partCode.localeCompare(right.partCode) || left.partId.localeCompare(right.partId);
          if (a === null) return 1;
          if (b === null) return -1;
          const compared = a < b ? -1 : 1;
          return input.sortDirection === 'desc' ? -compared : compared;
        });
        if (input.limit !== 0) items = items.slice(input.cursor, input.cursor + input.limit);
      }
      return {
        items,
        total,
        nextCursor: input.limit === 0 ? null : getNextCursor({ count: items.length, cursor: input.cursor, total }),
      };
    },
    { accessMode: 'read only', isolationLevel: 'repeatable read' },
  );
}

function sortValue(
  row: StockOnHandRow,
  sortBy: Exclude<StockOnHandListInput['sortBy'], 'part'>,
): string | number | null {
  if (sortBy === 'estimatedOnHand') {
    return row.estimatedOnHand === null
      ? null
      : row.estimatedOnHand.wholeUnits + (row.estimatedOnHand.openPlateRemainingPercent ?? 0) / 100;
  }
  if (sortBy === 'countStatus') {
    return row.stockTrackingMode === 'periodic' ? (row.asOfLastCount ?? 'No count yet') : 'Live';
  }
  return row[sortBy];
}
