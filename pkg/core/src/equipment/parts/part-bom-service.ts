import type { DatabaseTransaction, Db } from '@pkg/db';
import { partBom, parts } from '@pkg/db/equipment';
import { findBomCycle } from '@pkg/domain/equipment';
import type { AuditChanges, AuthId, UUID } from '@pkg/schema';
import type { PartBomResult, SavePartBomInput } from '@pkg/schema/equipment';
import { isWholeUnitQuantity, PartBomResult as PartBomResultSchema, unitClassFor } from '@pkg/schema/equipment';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { recordAuditUpdate } from '../audit/audit-service.js';
import {
  PartBomComponentNotFoundError,
  PartBomCycleError,
  PartBomQuantityError,
  PartNotBuiltError,
} from './part-bom-errors.js';
import { PartNotFoundError } from './part-errors.js';
import { partAuditDescriptor } from './part-service.js';

type PartBomDb = DatabaseTransaction | Db;

/** Arbitrary but fixed: every BOM save serializes against this one key. */
const BOM_GRAPH_LOCK_KEY = 1058;

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
export async function savePartBom({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: SavePartBomInput;
}): Promise<PartBomResult> {
  return db.transaction(async (tx) => {
    // The cycle check reads the whole graph, so locking only this parent would let two saves for
    // different parents each validate against the old graph and together close a loop. BOM writes
    // are rare and the catalog is small, so they take one transaction-scoped lock between them.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOM_GRAPH_LOCK_KEY})`);

    // Selected whole rather than by column: the audit event needs the same row the lock was taken
    // on, so re-reading it after the write would be a second query for a row that cannot have moved.
    const [part] = await tx.select().from(parts).where(eq(parts.id, input.partId)).for('update');
    if (!part) throw new PartNotFoundError(input.partId);
    if (!part.isInternallyFabricated) throw new PartNotBuiltError(input.partId);

    await assertComponentLines({ db: tx, lines: input.lines });
    await assertNoCycle({ db: tx, input });

    // A BOM change moves what every future build consumes and what it costs, so it is attributed
    // like any other catalog edit. The rows are a child collection, not an entity `mutateEntity`
    // can diff, so this takes the documented explicit audit path.
    const before = await getPartBom({ db: tx, partId: input.partId });

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

    const after = await getPartBom({ db: tx, partId: input.partId });
    const changes = diffBomLines(before.lines, after.lines);

    if (changes) {
      await recordAuditUpdate({ actorUserId, after: part, changes, db: tx, descriptor: partAuditDescriptor });
    }

    return after;
  });
}

/** One `bom` change carrying the whole list either side, since the lines are rewritten wholesale. */
function diffBomLines(before: PartBomResult['lines'], after: PartBomResult['lines']): AuditChanges | null {
  const summarise = (lines: PartBomResult['lines']) =>
    lines.map((line) => `${line.componentCode} x ${line.quantity}`).join(', ');
  const from = summarise(before);
  const to = summarise(after);

  return from === to ? null : { bom: { from, to } };
}

/** Every component must exist, and its quantity must respect that component's own unit class. */
async function assertComponentLines({
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
    if (!isWholeUnitQuantity(line.quantity, unitClassFor(component.unitOfMeasure))) {
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
