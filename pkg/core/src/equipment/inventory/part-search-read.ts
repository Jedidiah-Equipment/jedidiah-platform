import { createGlobalSearchCondition, type Db, withPagination } from '@pkg/db';
import { parts, stockMovements } from '@pkg/db/equipment';
import { getNextCursor } from '@pkg/schema';
import type { PartSearchInput, PartSearchResult } from '@pkg/schema/equipment';
import { PartSearchResult as PartSearchResultSchema } from '@pkg/schema/equipment';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

/**
 * The stores tablet's type-ahead: find a Part by code or name when its label will not scan (spec §10).
 *
 * Deliberately its own read rather than a `search` parameter on the stock report. That report exists
 * to value stock: it replays the entire ledger under a repeatable-read snapshot to derive a moving
 * average per Part. Running that per keystroke would be far more work than the question deserves,
 * and the tablet cannot see a price anyway — so this asks only what a person at a shelf needs, and
 * gets the quantity from a plain sum of deltas.
 *
 * Both code and name match, because neither alone is how a Part is recognised: the code is what is
 * printed on the bin, and the name is what the person was told to fetch.
 */
export async function searchPartStock({ db, input }: { db: Db; input: PartSearchInput }): Promise<PartSearchResult> {
  const where = createGlobalSearchCondition(input.search, [sql`${parts.code}`, sql`${parts.name}`]);
  const page = db
    .select({
      partCode: parts.code,
      partId: parts.id,
      partName: parts.name,
      // A revaluation moves cost, never quantity, so it must not reach this sum. Parts with no
      // movements at all still belong in the results — a shelf being empty is an answer, and a
      // storeman looking for one of those has to be able to find it.
      quantity: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::double precision`,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(parts)
    .leftJoin(stockMovements, and(eq(stockMovements.partId, parts.id), ne(stockMovements.movementType, 'revaluation')))
    .where(where)
    .groupBy(parts.id, parts.code, parts.name, parts.unitOfMeasure)
    .orderBy(asc(parts.code), asc(parts.id))
    .$dynamic();

  const [rows, total] = await Promise.all([withPagination(page, input), db.$count(parts, where)]);

  return PartSearchResultSchema.parse({
    items: rows,
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  });
}
