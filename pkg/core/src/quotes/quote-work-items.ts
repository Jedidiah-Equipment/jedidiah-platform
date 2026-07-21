import { type DatabaseTransaction, type Db, quoteWorkItemParts, quoteWorkItems } from '@pkg/db';
import { QuoteWorkItem, type QuoteWorkItemInput, type UUID } from '@pkg/schema';
import { asc, eq, inArray } from 'drizzle-orm';

export type QuoteWorkItemPartRow = typeof quoteWorkItemParts.$inferSelect;
type QuoteWorkItemBaseRow = typeof quoteWorkItems.$inferSelect;
export type QuoteWorkItemRow = QuoteWorkItemBaseRow & { parts: QuoteWorkItemPartRow[] };

export function mapQuoteWorkItem(row: QuoteWorkItemRow): QuoteWorkItem {
  return QuoteWorkItem.parse({
    createdAt: row.createdAt.toISOString(),
    hours: row.hours,
    id: row.id,
    name: row.name,
    parts: row.parts.map((part) => ({
      createdAt: part.createdAt.toISOString(),
      id: part.id,
      name: part.name,
      quantity: part.quantity,
      unitPrice: part.unitPrice,
      updatedAt: part.updatedAt.toISOString(),
      workItemId: part.workItemId,
    })),
    quoteId: row.quoteId,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function getWorkItemsByQuoteId({
  db,
  quoteIds,
}: {
  db: Db | DatabaseTransaction;
  quoteIds: readonly UUID[];
}): Promise<Map<UUID, QuoteWorkItemRow[]>> {
  if (quoteIds.length === 0) return new Map();

  const workItemRows = await db
    .select()
    .from(quoteWorkItems)
    .where(inArray(quoteWorkItems.quoteId, quoteIds))
    .orderBy(asc(quoteWorkItems.position), asc(quoteWorkItems.createdAt), asc(quoteWorkItems.id));
  const workItemIds = workItemRows.map((row) => row.id);
  const partRows =
    workItemIds.length === 0
      ? []
      : await db
          .select()
          .from(quoteWorkItemParts)
          .where(inArray(quoteWorkItemParts.workItemId, workItemIds))
          .orderBy(asc(quoteWorkItemParts.position), asc(quoteWorkItemParts.createdAt), asc(quoteWorkItemParts.id));
  const partsByWorkItemId = new Map<UUID, QuoteWorkItemPartRow[]>();

  for (const part of partRows) {
    const group = partsByWorkItemId.get(part.workItemId) ?? [];
    group.push(part);
    partsByWorkItemId.set(part.workItemId, group);
  }

  const byQuoteId = new Map<UUID, QuoteWorkItemRow[]>();
  for (const row of workItemRows) {
    const group = byQuoteId.get(row.quoteId) ?? [];
    group.push({ ...row, parts: partsByWorkItemId.get(row.id) ?? [] });
    byQuoteId.set(row.quoteId, group);
  }

  return byQuoteId;
}

export async function listQuoteWorkItems({
  quoteId,
  tx,
}: {
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<QuoteWorkItemRow[]> {
  return (await getWorkItemsByQuoteId({ db: tx, quoteIds: [quoteId] })).get(quoteId) ?? [];
}

export async function persistQuoteWorkItems({
  quoteId,
  tx,
  workItems,
}: {
  quoteId: UUID;
  tx: DatabaseTransaction;
  workItems: readonly QuoteWorkItemInput[];
}): Promise<QuoteWorkItemRow[]> {
  await tx.delete(quoteWorkItems).where(eq(quoteWorkItems.quoteId, quoteId));

  if (workItems.length === 0) return [];

  const insertedWorkItems = await tx
    .insert(quoteWorkItems)
    .values(workItems.map((item, position) => ({ hours: item.hours, name: item.name, position, quoteId })))
    .returning();
  const workItemIdByPosition = new Map(insertedWorkItems.map((row) => [row.position, row.id]));
  const parts = workItems.flatMap((item, workItemPosition) => {
    const workItemId = workItemIdByPosition.get(workItemPosition);
    if (!workItemId) throw new Error(`Work item insert did not return position ${workItemPosition}`);

    return item.parts.map((part, position) => ({
      name: part.name,
      position,
      quantity: part.quantity,
      unitPrice: part.unitPrice,
      workItemId,
    }));
  });

  if (parts.length > 0) await tx.insert(quoteWorkItemParts).values(parts);

  return listQuoteWorkItems({ quoteId, tx });
}
