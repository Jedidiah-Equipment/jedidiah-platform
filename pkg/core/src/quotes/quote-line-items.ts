import { type DatabaseTransaction, type Db, quoteLineItems } from '@pkg/db';
import { type QuoteCreateInput, QuoteLineItem, type QuoteUpdateInput, type UUID } from '@pkg/schema';
import { asc, eq, inArray } from 'drizzle-orm';

export type QuoteLineItemRow = typeof quoteLineItems.$inferSelect;

export function mapQuoteLineItem(row: QuoteLineItemRow): QuoteLineItem {
  return QuoteLineItem.parse({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    quoteId: row.quoteId,
    unitPrice: row.unitPrice,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function getLineItemsByQuoteId({
  db,
  quoteIds,
}: {
  db: Db | DatabaseTransaction;
  quoteIds: readonly UUID[];
}): Promise<Map<UUID, QuoteLineItemRow[]>> {
  if (quoteIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(quoteLineItems)
    .where(inArray(quoteLineItems.quoteId, quoteIds))
    .orderBy(asc(quoteLineItems.position), asc(quoteLineItems.createdAt), asc(quoteLineItems.id));
  const byQuoteId = new Map<UUID, QuoteLineItemRow[]>();

  for (const row of rows) {
    const group = byQuoteId.get(row.quoteId) ?? [];
    group.push(row);
    byQuoteId.set(row.quoteId, group);
  }

  return byQuoteId;
}

export async function listQuoteLineItems({
  quoteId,
  tx,
}: {
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<QuoteLineItemRow[]> {
  return tx
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId))
    .orderBy(asc(quoteLineItems.position), asc(quoteLineItems.createdAt), asc(quoteLineItems.id));
}

export async function persistQuoteLineItems({
  input,
  quoteId,
  tx,
}: {
  input: Pick<QuoteCreateInput | QuoteUpdateInput, 'lineItems'>;
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<QuoteLineItemRow[]> {
  await tx.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));

  const lineItems = input.lineItems ?? [];

  if (lineItems.length > 0) {
    await tx.insert(quoteLineItems).values(
      lineItems.map((item, position) => ({
        name: item.name,
        position,
        quantity: item.quantity,
        quoteId,
        unitPrice: item.unitPrice,
      })),
    );
  }

  return listQuoteLineItems({ quoteId, tx });
}
