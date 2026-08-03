import { type DatabaseTransaction, type Db, partBom, parts } from '@pkg/db';
import { findBomCycle } from '@pkg/domain';
import type { PartBomResult, SavePartBomInput, UUID } from '@pkg/schema';
import { PartBomResult as PartBomResultSchema, unitClassFor } from '@pkg/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import {
  PartBomComponentNotFoundError,
  PartBomCycleError,
  PartBomQuantityError,
  PartNotBuiltError,
} from './part-bom-errors.js';
import { PartNotFoundError } from './part-errors.js';

type PartBomDb = DatabaseTransaction | Db;

export async function getPartBom({ db, partId }: { db: PartBomDb; partId: UUID }): Promise<PartBomResult> {
  const component = parts;
  const rows = await db
    .select({
      componentCode: component.code,
      componentIsInternallyFabricated: component.isInternallyFabricated,
      componentName: component.name,
      componentPartId: partBom.componentPartId,
      componentStockTrackingMode: component.stockTrackingMode,
      componentUnitOfMeasure: component.unitOfMeasure,
      quantity: partBom.quantity,
    })
    .from(partBom)
    .innerJoin(component, eq(component.id, partBom.componentPartId))
    .where(eq(partBom.parentPartId, partId))
    .orderBy(asc(component.code), asc(partBom.componentPartId));

  return PartBomResultSchema.parse({ lines: rows, partId });
}

/**
 * Rewrites a built Part's whole BOM. An empty list is legitimate — that is the trivial build of a
 * Part whose components are all raw material, which posts nothing (spec §6).
 */
export async function savePartBom({ db, input }: { db: Db; input: SavePartBomInput }): Promise<PartBomResult> {
  return db.transaction(async (tx) => {
    const [part] = await tx
      .select({ id: parts.id, isInternallyFabricated: parts.isInternallyFabricated })
      .from(parts)
      .where(eq(parts.id, input.partId))
      .for('update');
    if (!part) throw new PartNotFoundError(input.partId);
    if (!part.isInternallyFabricated) throw new PartNotBuiltError(input.partId);

    await assertComponentsAreStockable({ db: tx, lines: input.lines });
    await assertNoCycle({ db: tx, input });

    await tx.delete(partBom).where(eq(partBom.parentPartId, input.partId));
    if (input.lines.length > 0) {
      await tx.insert(partBom).values(
        input.lines.map((line) => ({
          componentPartId: line.componentPartId,
          parentPartId: input.partId,
          quantity: line.quantity,
        })),
      );
    }

    return getPartBom({ db: tx, partId: input.partId });
  });
}

async function assertComponentsAreStockable({
  db,
  lines,
}: {
  db: DatabaseTransaction;
  lines: SavePartBomInput['lines'];
}): Promise<void> {
  if (lines.length === 0) return;

  const rows = await db
    .select({ id: parts.id, unitOfMeasure: parts.unitOfMeasure })
    .from(parts)
    .where(
      inArray(
        parts.id,
        lines.map((line) => line.componentPartId),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const line of lines) {
    const component = byId.get(line.componentPartId);
    if (!component) throw new PartBomComponentNotFoundError(line.componentPartId);
    if (unitClassFor(component.unitOfMeasure) !== 'measured' && !Number.isInteger(line.quantity)) {
      throw new PartBomQuantityError(line.componentPartId);
    }
  }
}

/**
 * The catalog is small, so the whole BOM graph is walked in memory rather than through a recursive
 * CTE — one read, and the pure walk is unit-testable on its own.
 */
async function assertNoCycle({ db, input }: { db: DatabaseTransaction; input: SavePartBomInput }): Promise<void> {
  if (input.lines.length === 0) return;

  const rows = await db
    .select({ componentPartId: partBom.componentPartId, parentPartId: partBom.parentPartId })
    .from(partBom);
  const bomByParent = new Map<string, string[]>();

  for (const row of rows) {
    // The BOM being saved replaces whatever this parent had, so its stored rows must not be walked.
    if (row.parentPartId === input.partId) continue;
    bomByParent.set(row.parentPartId, [...(bomByParent.get(row.parentPartId) ?? []), row.componentPartId]);
  }

  const cycle = findBomCycle({
    bomByParent,
    componentPartIds: input.lines.map((line) => line.componentPartId),
    parentPartId: input.partId,
  });
  if (cycle) throw new PartBomCycleError(cycle);
}
